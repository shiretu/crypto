import sys
import os
import numpy as np
import json
import torch
import torch.nn as nn
import torch.nn.functional as F

class Config:
    def __repr__(self):
        return json.dumps(vars(self), indent=2, default=str)

def init_config(argv,config):
    if len(argv) < 2:
        print(f"Usage: {argv[0]} <model_name>")
        sys.exit(1)
    config.model_name = argv[1]
    config.script_dir = os.path.dirname(os.path.abspath(__file__))
    config.project_root = os.path.dirname(config.script_dir)
    config.models_root = os.path.join(config.project_root, 'models')
    config.model_root = os.path.join(config.models_root, config.model_name)
    config.model_save_root = os.path.join(config.model_root, 'pyt')
    config.model_save_weights = os.path.join(config.model_save_root, "weights.bin")
    config.model_save_optimizer = os.path.join(config.model_save_root, "optimizer.bin")
    config.architecture_path = os.path.join(config.model_root, 'architecture.json')
    with open(config.architecture_path, 'r') as f:
        config.architecture = json.load(f)
    inputs_count = config.architecture['inputs_count']
    outputs_count = config.architecture['outputs_count']
    config.bytes_per_sample = (inputs_count + outputs_count) * 8
    if torch.backends.mps.is_available():
        config.device = 'mps'
    else:
        config.device = 'cpu'
    loss_name = config.architecture.get('loss', 'meanSquaredError')
    if loss_name == 'meanSquaredError':
        config.loss_fn = torch.nn.MSELoss()
    elif loss_name in ('meanAbsoluteError', 'mae'):
        config.loss_fn = torch.nn.L1Loss()
    elif loss_name == 'crossEntropy':
        config.loss_fn = torch.nn.CrossEntropyLoss()
    else:
        raise ValueError(f"Unsupported loss: {loss_name}")
    config.metrics = []
    for metric in config.architecture.get('metrics', []):
        if metric == 'mae':
            config.metrics.append(('mae', lambda output, y: torch.nn.functional.l1_loss(output, y).item()))
        elif metric == 'mse':
            config.metrics.append(('mse', lambda output, y: torch.nn.functional.mse_loss(output, y).item()))
    # Dynamically create optimizer factory from architecture.json
    opt_cfg = config.architecture.get('optimizer', {})
    opt_type = opt_cfg.get('type', 'adam').lower()
    opt_params = dict(opt_cfg)
    opt_params.pop('type', None)
    # Map 'learning_rate' to 'lr' for PyTorch
    if 'learning_rate' in opt_params:
        opt_params['lr'] = opt_params.pop('learning_rate')
    def optimizer_factory(params):
        if opt_type == 'adam':
            return torch.optim.Adam(params, **opt_params)
        elif opt_type == 'sgd':
            return torch.optim.SGD(params, **opt_params)
        elif opt_type == 'rmsprop':
            return torch.optim.RMSprop(params, **opt_params)
        else:
            raise ValueError(f"Unsupported optimizer type: {opt_type}")
    config.optimizer = optimizer_factory
    

class DynamicNN(nn.Module):
    def __init__(self, architecture):
        super().__init__()
        layers = []
        input_dim = architecture['inputs_count']
        for layer in architecture['layers']:
            if layer['type'] == 'dense':
                layers.append(nn.Linear(input_dim, layer['units']))
                input_dim = layer['units']
                act = layer.get('activation', 'linear')
                if act == 'relu':
                    layers.append(nn.ReLU())
                elif act == 'tanh':
                    layers.append(nn.Tanh())
                elif act == 'sigmoid':
                    layers.append(nn.Sigmoid())
                elif act == 'linear':
                    pass
                else:
                    raise ValueError(f"Unsupported activation: {act}")
            elif layer['type'] == 'dropout':
                layers.append(nn.Dropout(layer['rate']))
            else:
                raise ValueError(f"Unsupported layer type: {layer['type']}")
        self.model = nn.Sequential(*layers)

    def forward(self, x):
        return self.model(x)

def main():
    config = Config()
    init_config(sys.argv, config)
    # Ensure model_save_root exists
    os.makedirs(config.model_save_root, exist_ok=True)
    net = DynamicNN(config.architecture).to(config.device)
    optimizer = config.optimizer(net.parameters())
    # Try to load weights and optimizer state from bin files if present
    if os.path.exists(config.model_save_weights):
        net.load_state_dict(torch.load(config.model_save_weights, map_location=config.device))
        # print(f"Loaded weights from {config.model_save_weights}")
    if os.path.exists(config.model_save_optimizer):
        optimizer.load_state_dict(torch.load(config.model_save_optimizer, map_location=config.device))
        # print(f"Loaded optimizer state from {config.model_save_optimizer}")
    print(f"bytesCount: {config.bytes_per_sample}")
    # print(f"PyTorch loss function: {config.loss_fn.__class__.__name__}, reduction: {getattr(config.loss_fn, 'reduction', 'N/A')}")
    sys.stdout.flush()

    while True:
        raw = sys.stdin.buffer.read(config.bytes_per_sample)
        arr = np.frombuffer(raw, dtype=np.float64)
        outputs_count = config.architecture['outputs_count']
        x = arr[:config.architecture['inputs_count']]
        y = arr[-outputs_count:]
        x_tensor = torch.tensor(x, dtype=torch.float32, device=config.device).unsqueeze(0)
        y_tensor = torch.tensor(y, dtype=torch.float32, device=config.device).unsqueeze(0)
        optimizer.zero_grad()
        output = net(x_tensor)
        loss = config.loss_fn(output, y_tensor)
        loss.backward()
        optimizer.step()
        metrics_result = {name: fn(output, y_tensor) for name, fn in config.metrics}

        computed = output.detach().cpu().numpy().flatten()
        overall_loss = loss.item()
        per_output_losses = ((computed - y) ** 2).tolist()
        loss_list = [overall_loss] + per_output_losses

        result = {
            "wanted": y.tolist() if hasattr(y, 'tolist') else list(y),
            "computed": computed.tolist() if hasattr(computed, 'tolist') else list(computed),
            "loss": loss_list,
            "metrics": metrics_result
        }
        print(json.dumps(result))
        sys.stdout.flush()

        # Save weights and optimizer state every 100 iterations
        if not hasattr(main, "iteration"):
            main.iteration = 0
        main.iteration += 1
        if main.iteration % 100 == 0:
            torch.save(net.state_dict(), config.model_save_weights)
            torch.save(optimizer.state_dict(), config.model_save_optimizer)
            # print(f"Saved weights to {config.model_save_weights} and optimizer state to {config.model_save_optimizer}")

if __name__ == "__main__":
    main()

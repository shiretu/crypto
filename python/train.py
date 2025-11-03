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
    # Merge defaults from models/optimizers.json to mirror JS behavior
    optimizers_defaults_path = os.path.join(config.models_root, 'optimizers.json')
    try:
        with open(optimizers_defaults_path, 'r') as f:
            optimizers_defaults = json.load(f)
    except Exception:
        optimizers_defaults = {}
    opt_cfg = dict(config.architecture.get('optimizer', {}))
    opt_type = opt_cfg.get('type', 'adam').lower()
    if opt_type in optimizers_defaults:
        merged = dict(optimizers_defaults[opt_type])
        merged.update(opt_cfg)
        opt_cfg = merged
    opt_params = dict(opt_cfg)
    opt_params.pop('type', None)
    # Map common parameter names to PyTorch equivalents
    if 'learning_rate' in opt_params:
        opt_params['lr'] = opt_params.pop('learning_rate')
    # Per-optimizer tweaks
    if opt_type == 'rmsprop':
        # TFJS uses 'decay' ~ PyTorch alpha; epsilon -> eps
        if 'decay' in opt_params:
            opt_params['alpha'] = opt_params.pop('decay')
        if 'epsilon' in opt_params:
            opt_params['eps'] = opt_params.pop('epsilon')
    elif opt_type in ('adam', 'adamax'):
        # epsilon -> eps, (beta1,beta2) -> betas
        if 'epsilon' in opt_params:
            opt_params['eps'] = opt_params.pop('epsilon')
        if 'beta1' in opt_params or 'beta2' in opt_params:
            b1 = opt_params.pop('beta1', 0.9)
            b2 = opt_params.pop('beta2', 0.999)
            opt_params['betas'] = (b1, b2)
        # 'decay' in our JSON for adamax is not a PyTorch arg; drop it
        opt_params.pop('decay', None)
    elif opt_type == 'sgd':
        # use_nesterov -> nesterov
        if 'use_nesterov' in opt_params:
            opt_params['nesterov'] = opt_params.pop('use_nesterov')
    # Remove non-optimizer metadata
    opt_params.pop('description', None)

    # Filter only supported params per optimizer to avoid unexpected kwargs
    allowed = {
        'adam': {'lr', 'betas', 'eps', 'weight_decay', 'amsgrad'},
        'adamax': {'lr', 'betas', 'eps', 'weight_decay'},
        'rmsprop': {'lr', 'alpha', 'eps', 'weight_decay', 'momentum', 'centered'},
        'sgd': {'lr', 'momentum', 'dampening', 'weight_decay', 'nesterov'},
    }.get(opt_type, set())
    if allowed:
        opt_params = {k: v for k, v in opt_params.items() if k in allowed}
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
                act = (layer.get('activation') or 'linear').lower()
                if act == 'relu':
                    layers.append(nn.ReLU())
                elif act in ('leakyrelu', 'leaky_relu'):
                    negative_slope = layer.get('negative_slope', layer.get('alpha', 0.01))
                    layers.append(nn.LeakyReLU(negative_slope=negative_slope))
                elif act == 'elu':
                    alpha = layer.get('alpha', 1.0)
                    layers.append(nn.ELU(alpha=alpha))
                elif act == 'selu':
                    layers.append(nn.SELU())
                elif act == 'gelu':
                    layers.append(nn.GELU())
                elif act == 'tanh':
                    layers.append(nn.Tanh())
                elif act == 'sigmoid':
                    layers.append(nn.Sigmoid())
                elif act == 'linear' or act == 'identity' or act is None:
                    layers.append(nn.Identity())
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

    iteration = 0
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
        iteration += 1
        if iteration % 100 == 0:
            torch.save(net.state_dict(), config.model_save_weights)
            torch.save(optimizer.state_dict(), config.model_save_optimizer)
            # print(f"Saved weights to {config.model_save_weights} and optimizer state to {config.model_save_optimizer}")

if __name__ == "__main__":
    main()

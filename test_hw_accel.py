import torch
import platform

def detect_cpu():
    return platform.processor() or platform.machine() or 'Unknown CPU'

def detect_gpu():
    if torch.cuda.is_available():
        return f"CUDA GPU: {torch.cuda.get_device_name(0)}"
    else:
        return None

# PyTorch does not natively support NPU detection, but some platforms (like Huawei Ascend) may expose it via torch_npu
try:
    import torch_npu
    npu_available = torch_npu.npu.is_available()
    npu_name = torch_npu.npu.get_device_name(0) if npu_available else None
except ImportError:
    npu_available = False
    npu_name = None

def detect_npu():
    if npu_available:
        return f"NPU: {npu_name}"
    else:
        return None

if __name__ == "__main__":
    print(f"CPU: {detect_cpu()}")
    gpu = detect_gpu()
    if gpu:
        print(gpu)
    else:
        print("CUDA GPU: Not available")
    npu = detect_npu()
    if npu:
        print(npu)
    else:
        print("NPU: Not available")

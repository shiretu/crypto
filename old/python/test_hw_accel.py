import torch
import platform

# Helper to test if a backend is available
def is_backend_usable(attr):
    backend = getattr(torch.backends, attr, None)
    if backend is None or attr.startswith("__"):
        return None
    try:
        if hasattr(backend, "is_available"):
            return backend.is_available()
    except Exception:
        return False
    return None

if __name__ == "__main__":
    # Print a table of only real backends (with is_available), and add CPU as always available
    print("\nTorch Backends Status:")
    print(f"{'Backend':<15} | {'Status':<12}")
    print("-" * 30)
    print(f"{'cpu':<15} | {'available':<12}")
    for attr in dir(torch.backends):
        if attr.startswith("__") or attr == "cpu":
            continue
        backend = getattr(torch.backends, attr, None)
        if hasattr(backend, "is_available") and callable(backend.is_available):
            usable = is_backend_usable(attr)
            print(f"{attr:<15} | {'available' if usable else 'not available':<12}")


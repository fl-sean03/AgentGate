# User Execution Guide — Running LAMMPS, QE, and ML from Anywhere

This guide provides **exact, copy-paste execution commands** for running LAMMPS, Quantum ESPRESSO (QE), and ML (PyTorch/CuPy/JAX) implementations from anywhere in your workspace.

All commands use **absolute paths** rooted at the repository base directory.

---

## Table of Contents

1. [Quick Reference (TL;DR)](#quick-reference-tldr)
2. [Repository Location](#repository-location)
3. [Prerequisites & System Baseline](#prerequisites--system-baseline)
4. [LAMMPS — Molecular Dynamics](#lammps--molecular-dynamics)
5. [ML — Machine Learning (PyTorch/CuPy/JAX)](#ml--machine-learning-pytorchcupyjax)
6. [QE — Quantum ESPRESSO (DFT)](#qe--quantum-espresso-dft)
7. [Running the Full Regression Suite](#running-the-full-regression-suite)
8. [Troubleshooting](#troubleshooting)

---

## Quick Reference (TL;DR)

### LAMMPS (from anywhere)
```bash
# CPU
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp \
  -in /path/to/your/input.lmp -var nsteps 5000

# GPU
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp \
  -sf gpu -pk gpu 1 neigh yes \
  -in /path/to/your/input.lmp -var nsteps 5000
```

### ML (from anywhere)
```bash
# Verify GPU works
conda run -n blackwell-ml python /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/tests/verify_ml_gpu.py

# Training smoke test
conda run -n blackwell-ml python /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/tests/train_mlp_smoke.py
```

### QE (from anywhere)
```bash
# CPU
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x < input.in > output.out

# GPU (source NVHPC first)
source /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/env/setup_nvhpc.sh
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-gpu/bin/pw.x < input.in > output.out
```

---

## Repository Location

The repository is located at:

```
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests
```

For convenience, you can set an environment variable:

```bash
export GPUTESTS_REPO="/home/sf2/Workspace/main/39-GPUTests/1-GPUTests"
```

Then use `$GPUTESTS_REPO` in place of the full path in all examples below.

---

## Prerequisites & System Baseline

### 1. Verify WSL2 GPU Baseline

Before running any GPU workloads, verify that your system baseline is correct:

```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/system/check_baseline.sh
```

**Expected output:** All checks should pass, including:
- WSL2 detected
- `nvidia-smi` works
- CUDA 12.8 toolkit at `/usr/local/cuda-12.8`
- WSL libcuda present at `/usr/lib/wsl/lib/`

### 2. CUDA Environment (for builds/direct CUDA usage)

If you need CUDA tools (nvcc, CUDA libraries) in your current shell:

```bash
source /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/system/setup_cuda_env.sh
```

This sets:
- `CUDA_HOME=/usr/local/cuda-12.8`
- Adds `$CUDA_HOME/bin` to `PATH`
- Adds `/usr/lib/wsl/lib` and `$CUDA_HOME/lib64` to `LD_LIBRARY_PATH`

---

## LAMMPS — Molecular Dynamics

### Binary Location

The GPU-enabled LAMMPS binary is installed at:

```
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp
```

### Running LAMMPS (CPU Mode)

```bash
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp \
  -in /path/to/your/input.lmp \
  -var nsteps 5000
```

**Example with the built-in LJ benchmark:**

```bash
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp \
  -in /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/bench/cases/lj/in.lj \
  -var nsteps 5000
```

### Running LAMMPS (GPU Mode)

Add the GPU package flags: `-sf gpu -pk gpu 1 neigh yes`

```bash
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp \
  -sf gpu -pk gpu 1 neigh yes \
  -in /path/to/your/input.lmp \
  -var nsteps 5000
```

**Example with the built-in LJ benchmark (GPU):**

```bash
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp \
  -sf gpu -pk gpu 1 neigh yes \
  -in /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/bench/cases/lj/in.lj \
  -var nsteps 5000
```

### GPU Package Flags Explained

| Flag | Description |
|------|-------------|
| `-sf gpu` | Use GPU-accelerated pair styles (suffix gpu) |
| `-pk gpu 1` | Use 1 GPU device |
| `neigh yes` | Build neighbor lists on GPU (faster for most cases) |

### Running LAMMPS Benchmarks

#### LJ Benchmark (CPU vs GPU comparison)

```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/bench/run_cpu_gpu.sh
```

Override settings:
```bash
NSTEPS=10000 LMP=/path/to/custom/lmp bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/bench/run_cpu_gpu.sh
```

#### Rhodopsin Benchmark (larger molecular system)

```bash
NSTEPS=100 bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/bench/run_rhodo_cpu_gpu.sh
```

#### Peptide Benchmark

**Prerequisite:** Clone LAMMPS source first (one-time):
```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/scripts/clone_lammps.sh
```

Then run:
```bash
NSTEPS=1000 bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/bench/run_peptide_cpu_gpu.sh
```

### Parse Performance from LAMMPS Logs

Extract timing info to JSON:

```bash
python /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/bench/parse_lammps_log.py \
  /path/to/log.lammps
```

### Using Your Own Input Files

For custom simulations, just point to your input file:

```bash
# CPU
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp \
  -in /home/sf2/my_project/my_simulation.in

# GPU
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp \
  -sf gpu -pk gpu 1 neigh yes \
  -in /home/sf2/my_project/my_simulation.in
```

**Note:** Your input file may need modification to use GPU-compatible pair styles. Not all LAMMPS pair styles have GPU implementations.

---

## ML — Machine Learning (PyTorch/CuPy/JAX)

### Environment Setup

The ML stack uses a conda environment named `blackwell-ml`.

#### Create/Update the Environment (one-time or to update)

```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/env/create_blackwell_ml.sh
```

This installs:
- Python 3.11
- PyTorch with CUDA 12.8 support (`cu128` wheels)
- CuPy (`cupy-cuda12x`)
- numpy, scipy, pandas, matplotlib, ipython

### Running ML Tests (from anywhere)

Use `conda run -n blackwell-ml` to execute without activating the environment:

#### Verify GPU is Working

```bash
conda run -n blackwell-ml python /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/tests/verify_ml_gpu.py
```

**Expected output:**
- PyTorch version and CUDA version printed
- GPU name and compute capability (should be 12.x for Blackwell)
- CuPy dot product result
- "OK: ML GPU sanity checks passed."

#### Training Smoke Test (GPU-required)

```bash
conda run -n blackwell-ml python /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/tests/train_mlp_smoke.py
```

Or use the wrapper script:

```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/tests/run_train_mlp_smoke.sh
```

### Running ML Benchmarks

#### Matrix Multiplication Benchmark

```bash
conda run -n blackwell-ml bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/bench/run_matmul_bench.sh
```

#### Single Benchmark Run (custom parameters)

```bash
conda run -n blackwell-ml python /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/bench/matmul_bench.py \
  --device cuda --dtype fp16 --n 8192 --warmup 5 --iters 20
```

Parameters:
- `--device`: `cpu` or `cuda`
- `--dtype`: `fp32` or `fp16`
- `--n`: Matrix size (n x n)
- `--warmup`: Warmup iterations
- `--iters`: Timed iterations

### JAX (Optional)

JAX is not installed by default. To install and verify:

```bash
# Install JAX with CUDA 12 plugin
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/env/install_jax_cuda12.sh

# Verify JAX GPU
conda run -n blackwell-ml python /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/tests/verify_jax_gpu.py
```

### Using Your Own ML Scripts

Simply run with the `blackwell-ml` environment:

```bash
conda run -n blackwell-ml python /path/to/your/script.py
```

Or activate the environment interactively:

```bash
conda activate blackwell-ml
python /path/to/your/script.py
```

Example PyTorch script:

```python
import torch

# Verify CUDA
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"Device: {torch.cuda.get_device_name(0)}")

# Your GPU computations
x = torch.randn(1000, 1000, device='cuda')
y = torch.matmul(x, x)
print(f"Result shape: {y.shape}")
```

---

## QE — Quantum ESPRESSO (DFT)

### Binary Locations

| Build | Binary Path |
|-------|-------------|
| CPU | `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x` |
| GPU | `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-gpu/bin/pw.x` |

### Running QE (CPU Mode)

```bash
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x < input.in > output.out
```

With MPI (if available):

```bash
mpirun -np 4 /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x < input.in > output.out
```

### Running QE (GPU Mode)

**Important:** The GPU build requires the NVHPC environment to be active.

```bash
# Step 1: Activate NVHPC environment
source /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/env/setup_nvhpc.sh

# Step 2: Run pw.x (GPU)
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-gpu/bin/pw.x < input.in > output.out
```

With MPI:

```bash
source /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/env/setup_nvhpc.sh
mpirun -np 1 /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-gpu/bin/pw.x -nk 1 < input.in > output.out
```

### Running QE Example Calculations

#### CPU Example (Si SCF)

```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/scripts/run_example01_cpu.sh
```

#### GPU Example (Si SCF)

```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/scripts/run_example01_gpu.sh
```

### Fetching QE Source (if needed)

If you need the QE source code for examples or rebuilding:

```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/scripts/fetch_source.sh
```

This downloads QE 7.5 to `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/src/`.

### Rebuilding QE

#### CPU Build

```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/scripts/configure_cpu.sh
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/scripts/build_cpu.sh
```

#### GPU Build

```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/scripts/configure_gpu.sh
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/scripts/build_gpu.sh
```

### Using Your Own QE Input Files

For custom DFT calculations:

```bash
# CPU
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x < /path/to/your/scf.in > scf.out

# GPU (source NVHPC first!)
source /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/env/setup_nvhpc.sh
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-gpu/bin/pw.x < /path/to/your/scf.in > scf.out
```

### Available QE Executables

After building, these executables are available in the `bin/` directories:

- `pw.x` — Plane-wave self-consistent field
- `ph.x` — Phonons
- `pp.x` — Post-processing
- `bands.x` — Band structure
- `projwfc.x` — Projected wavefunctions/DOS
- And more...

---

## Running the Full Regression Suite

The repository includes a comprehensive regression suite that tests all stacks:

### Default Regression (fast)

```bash
bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/tools/run_regression.sh
```

### Full Regression (all optional stages)

```bash
RUN_LAMMPS_DEEP=1 RUN_ML_JAX=1 RUN_QE_GPU=1 \
  bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/tools/run_regression.sh
```

### Regression Flags

| Flag | Description |
|------|-------------|
| `RUN_LAMMPS_DEEP=1` | Enable rhodopsin + peptide benchmarks |
| `RUN_ML_JAX=1` | Enable JAX GPU verification |
| `RUN_QE_GPU=1` | Enable QE GPU SCF test |

---

## Troubleshooting

### "nvidia-smi not found" or GPU not visible

1. Ensure you're running in WSL2 (not WSL1)
2. Update Windows NVIDIA drivers
3. Run `nvidia-smi` in Windows PowerShell to verify GPU is working on host

### LAMMPS: "GPU package not available"

The binary must be built with GPU support. Use the provided binary:
```
/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp
```

### ML: "conda: command not found"

Install Miniconda/Anaconda:
```bash
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
```

### ML: "torch.cuda.is_available() returns False"

1. Ensure `nvidia-smi` works in WSL
2. Recreate the ML environment:
   ```bash
   bash /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/ml/env/create_blackwell_ml.sh
   ```

### QE GPU: "NVHPC not found"

The NVHPC compiler suite must be installed at `$HOME/hpc-sdk/25.11`. This is a prerequisite for the GPU build.

### QE GPU: "GPU acceleration is ACTIVE" not appearing

Ensure you:
1. Sourced the NVHPC environment: `source dft-qe/env/setup_nvhpc.sh`
2. Are using the GPU binary: `dft-qe/build-gpu/bin/pw.x`
3. The input doesn't exceed GPU memory

---

## Summary Table

| Stack | CPU Command | GPU Command |
|-------|------------|-------------|
| **LAMMPS** | `lmp -in input.lmp` | `lmp -sf gpu -pk gpu 1 neigh yes -in input.lmp` |
| **ML** | `conda run -n blackwell-ml python script.py` (uses GPU by default if available) | Same |
| **QE** | `pw.x < input.in` | `source setup_nvhpc.sh && pw.x < input.in` |

**Binary Paths:**
- LAMMPS: `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/md-lammps/install/bin/lmp`
- QE CPU: `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-cpu/bin/pw.x`
- QE GPU: `/home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/build-gpu/bin/pw.x`

**Environment Activation:**
- ML: `conda activate blackwell-ml` or `conda run -n blackwell-ml ...`
- QE GPU: `source /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/dft-qe/env/setup_nvhpc.sh`
- CUDA tools: `source /home/sf2/Workspace/main/39-GPUTests/1-GPUTests/system/setup_cuda_env.sh`

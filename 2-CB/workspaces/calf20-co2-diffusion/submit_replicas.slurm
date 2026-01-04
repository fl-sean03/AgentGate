#!/bin/bash
#SBATCH --job-name=calf20-co2
#SBATCH --output=replica_%a.out
#SBATCH --error=replica_%a.err
#SBATCH --array=1-8
#SBATCH --ntasks=16
#SBATCH --cpus-per-task=1
#SBATCH --time=06:00:00
#SBATCH --partition=normal

# ============================================================
# CALF-20 + CO2 Diffusion - Replica Job Array
# ============================================================
# Runs 8 independent replicas with different random seeds
# Each replica: 16 MPI ranks, 6 hours, ~10 ns production
# Total: 128 cores, ~80 ns combined sampling
# ============================================================

# Load modules (adjust for your cluster)
# module load lammps
# module load openmpi

# Set LAMMPS binary path (adjust for your cluster)
LAMMPS_BIN="lmp"  # or full path like /path/to/lmp

# Generate unique seed from array task ID
SEED=$((10000 + ${SLURM_ARRAY_TASK_ID} * 1111))

# Create replica directory
REPLICA_DIR="replica_${SLURM_ARRAY_TASK_ID}"
mkdir -p ${REPLICA_DIR}
cd ${REPLICA_DIR}

# Copy input files
cp ../calf20_333_co2_27.data .
cp ../co2_diffusion_hpc.in .

# Run LAMMPS
echo "Starting replica ${SLURM_ARRAY_TASK_ID} with seed ${SEED}"
echo "Time: $(date)"

mpirun -np ${SLURM_NTASKS} ${LAMMPS_BIN} \
    -in co2_diffusion_hpc.in \
    -var SEED ${SEED} \
    -log log.lammps

echo "Finished replica ${SLURM_ARRAY_TASK_ID}"
echo "Time: $(date)"

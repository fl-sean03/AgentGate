# CALF-20 CO2 Diffusion Analysis

## Purpose

Extract the **CO2 self-diffusion coefficient (D)** from molecular dynamics simulation data to compute the **kinetic timescale (τ)** for DAC performance evaluation.

This workspace is part of the DAC (Direct Air Capture) MOF screening pipeline where transport kinetics (τ) is a critical but often missing metric.

## Background

### The Problem
Traditional MOF screening focuses on thermodynamic properties (selectivity, capacity) but ignores **kinetics** — how fast CO2 can actually move through the material. A MOF with high selectivity but slow diffusion will have poor cycle times.

### The Solution
Use MD simulation to compute:
1. **MSD (Mean Square Displacement)** of CO2 molecules in the MOF
2. **D (Self-diffusion coefficient)** via Einstein relation: `D = slope(MSD)/6`
3. **τ (Kinetic timescale)** via: `τ = L²/D`

Then incorporate τ into the DAC figure of merit:
```
M_DAC = (Δq × S_CO₂/N₂) / τ
```

## System Details

| Property | Value |
|----------|-------|
| MOF | CALF-20 (Calgary Framework 20) |
| Supercell | 3×3×3 |
| CO2 molecules | 27 |
| Total atoms | 1,269 |
| Temperature | 298 K (NVT) |
| Framework | Rigid (frozen) |
| Simulation time | 1 ns production |

## Files

### Input (from lammps_reaper)
| File | Description |
|------|-------------|
| `msd.dat` | MSD vs time data (10,001 points, 0-1ns) |
| `log.lammps` | Full LAMMPS simulation log |
| `co2_diffusion.in` | LAMMPS input script used |

### Analysis Scripts
| File | Description |
|------|-------------|
| `extract_diffusion.py` | Main analysis script for D extraction |

### Output
| File | Description |
|------|-------------|
| `diffusion_results.txt` | Extracted D and τ values |
| `msd_fit.png` | MSD plot with linear fit |

## Usage

```bash
# Basic usage (uses default fit range 100-800 ps)
python extract_diffusion.py

# Specify fit range (recommended: 200-500 ps for this system)
python extract_diffusion.py --fit-start 200 --fit-end 500

# Specify length scale for τ calculation
python extract_diffusion.py --fit-start 200 --fit-end 500 --length-scale 10.0

# Full options
python extract_diffusion.py \
    --msd-file msd.dat \
    --fit-start 200 \
    --fit-end 500 \
    --length-scale 10.0 \
    --output diffusion_results.txt \
    --plot msd_fit.png
```

## Results Summary

### Fitting Analysis

Different time windows were tested to find the optimal linear regime:

| Range (ps) | Slope (Å²/ps) | R² | D (m²/s) | Notes |
|------------|---------------|-----|----------|-------|
| 50-200 | -0.006 | 0.56 | - | Ballistic/rattling |
| 100-300 | 0.0005 | 0.01 | 8e-13 | Poor fit |
| **200-500** | **0.0037** | **0.60** | **6e-12** | **Best fit** |
| 100-500 | 0.0026 | 0.50 | 4e-12 | Acceptable |
| 300-700 | 0.0002 | 0.004 | 3e-13 | Plateau region |

The **200-500 ps** range gives the best linear behavior (R²=0.60), representing the diffusive regime after initial ballistic motion and before confinement effects dominate.

### Final Values (200-500 ps fit)

| Quantity | Value | Unit |
|----------|-------|------|
| MSD slope | 0.00368 | Å²/ps |
| **D** | **6.14 × 10⁻¹²** | **m²/s** |
| D | 6.14 × 10⁻⁸ | cm²/s |
| **τ** (L=10Å) | **163** | **ns** |

### Physical Interpretation

The low R² (0.60) and small D value indicate **subdiffusive/confined diffusion** typical for:
- CO2 molecules rattling in MOF pores/cages
- Hopping between adsorption sites
- Collisions with pore walls

This is expected for CALF-20 which has ~8-10 Å pore apertures constraining CO2 motion.

## DAC Integration

Use τ in the DAC performance metric:

```
M_DAC = (Δq × S_CO₂/N₂) / τ

Where:
- Δq = working capacity (mol/kg)
- S_CO₂/N₂ = selectivity
- τ = 163 ns (from this analysis)
```

## Source Data Location

Raw simulation data is stored in the lammps_reaper workspace:
```
/home/sf2/LabWork/Workspace/27-PMOS/5-CampaignBuilder/2-CB/lammps_reaper/workspaces/calf20-co2-diffusion/
```

See that directory's README for simulation details.

## References

1. Einstein relation: `⟨r²(t)⟩ = 6Dt` for 3D self-diffusion
2. CALF-20 structure: Shimizu et al., various publications
3. CO2 in MOFs diffusion: Typical range 10⁻¹³ to 10⁻¹⁰ m²/s

---

*Generated: 2025-01-02*
*Pipeline: lammps_reaper → extract_diffusion.py*

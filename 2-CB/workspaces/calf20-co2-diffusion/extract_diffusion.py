#!/usr/bin/env python3
"""
Extract CO2 Self-Diffusion Coefficient from MSD Data
=====================================================

This script performs linear regression on the MSD vs time data to extract
the self-diffusion coefficient D using the Einstein relation:

    MSD(t) = 6 * D * t  (for 3D diffusion)

    Therefore: D = slope(MSD vs t) / 6

The script also computes the kinetic timescale τ for DAC performance:

    τ = L² / D

Where L is a characteristic length scale (e.g., particle diameter, pore size).

Usage:
    python extract_diffusion.py [--fit-start 100] [--fit-end 500] [--length-scale 10.0]
"""

import numpy as np
import argparse
from pathlib import Path


def load_msd_data(filepath: str) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Load MSD data from LAMMPS fix ave/time output.

    Returns:
        timestep, msd_x, msd_y, msd_z, msd_total (all in original units)
    """
    data = np.loadtxt(filepath, comments='#')
    timestep = data[:, 0]      # fs
    msd_x = data[:, 1]         # Å²
    msd_y = data[:, 2]         # Å²
    msd_z = data[:, 3]         # Å²
    msd_total = data[:, 4]     # Å²
    return timestep, msd_x, msd_y, msd_z, msd_total


def fit_linear_regime(time_ps: np.ndarray, msd: np.ndarray,
                      fit_start_ps: float, fit_end_ps: float) -> tuple[float, float, float]:
    """Fit linear regime of MSD vs time.

    Args:
        time_ps: Time in picoseconds
        msd: MSD in Å²
        fit_start_ps: Start of fitting window (ps)
        fit_end_ps: End of fitting window (ps)

    Returns:
        slope (Å²/ps), intercept (Å²), r_squared
    """
    mask = (time_ps >= fit_start_ps) & (time_ps <= fit_end_ps)
    t_fit = time_ps[mask]
    msd_fit = msd[mask]

    if len(t_fit) < 10:
        raise ValueError(f"Not enough points in fit range [{fit_start_ps}, {fit_end_ps}] ps")

    # Linear regression: MSD = slope * t + intercept
    coeffs = np.polyfit(t_fit, msd_fit, 1)
    slope = coeffs[0]       # Å²/ps
    intercept = coeffs[1]   # Å²

    # R² calculation
    msd_pred = slope * t_fit + intercept
    ss_res = np.sum((msd_fit - msd_pred) ** 2)
    ss_tot = np.sum((msd_fit - np.mean(msd_fit)) ** 2)
    r_squared = 1 - (ss_res / ss_tot)

    return slope, intercept, r_squared


def compute_diffusion_coefficient(slope_angstrom2_per_ps: float) -> dict:
    """Compute diffusion coefficient from MSD slope.

    Einstein relation: MSD = 6*D*t for 3D diffusion
    Therefore: D = slope / 6

    Args:
        slope_angstrom2_per_ps: Slope of MSD vs time (Å²/ps)

    Returns:
        Dictionary with D in various units
    """
    D_angstrom2_ps = slope_angstrom2_per_ps / 6.0

    # Unit conversions
    # 1 Å²/ps = 1e-20 m² / 1e-12 s = 1e-8 m²/s
    D_m2_s = D_angstrom2_ps * 1e-8

    # 1 m²/s = 1e4 cm²/s
    D_cm2_s = D_m2_s * 1e4

    return {
        'D_angstrom2_ps': D_angstrom2_ps,
        'D_angstrom2_fs': D_angstrom2_ps * 1e-3,  # Å²/fs
        'D_m2_s': D_m2_s,
        'D_cm2_s': D_cm2_s,
    }


def compute_kinetic_timescale(D_m2_s: float, L_angstrom: float) -> dict:
    """Compute kinetic timescale τ = L² / D.

    Args:
        D_m2_s: Diffusion coefficient (m²/s)
        L_angstrom: Characteristic length scale (Å)

    Returns:
        Dictionary with τ in various units
    """
    L_m = L_angstrom * 1e-10  # Convert Å to m

    tau_s = (L_m ** 2) / D_m2_s
    tau_ms = tau_s * 1e3
    tau_us = tau_s * 1e6
    tau_ns = tau_s * 1e9

    return {
        'tau_s': tau_s,
        'tau_ms': tau_ms,
        'tau_us': tau_us,
        'tau_ns': tau_ns,
        'L_angstrom': L_angstrom,
    }


def save_results(results: dict, output_path: str):
    """Save results to a text file."""
    with open(output_path, 'w') as f:
        f.write("=" * 60 + "\n")
        f.write("CO2 Self-Diffusion Analysis Results\n")
        f.write("=" * 60 + "\n\n")

        f.write("--- Fitting Parameters ---\n")
        f.write(f"Fit range: {results['fit_start_ps']:.1f} - {results['fit_end_ps']:.1f} ps\n")
        f.write(f"Number of points: {results['n_points']}\n")
        f.write(f"R² (goodness of fit): {results['r_squared']:.6f}\n\n")

        f.write("--- MSD Linear Fit ---\n")
        f.write(f"Slope: {results['slope_angstrom2_ps']:.6f} Å²/ps\n")
        f.write(f"Intercept: {results['intercept_angstrom2']:.6f} Å²\n\n")

        f.write("--- Self-Diffusion Coefficient D ---\n")
        f.write(f"D = {results['D_angstrom2_ps']:.6e} Å²/ps\n")
        f.write(f"D = {results['D_m2_s']:.6e} m²/s\n")
        f.write(f"D = {results['D_cm2_s']:.6e} cm²/s\n\n")

        f.write("--- Kinetic Timescale τ ---\n")
        f.write(f"Length scale L: {results['L_angstrom']:.1f} Å\n")
        f.write(f"τ = L²/D = {results['tau_ns']:.3f} ns\n")
        f.write(f"τ = {results['tau_us']:.6f} µs\n")
        f.write(f"τ = {results['tau_ms']:.9f} ms\n\n")

        f.write("--- DAC Performance Metric ---\n")
        f.write("M_DAC = (Δq × S_CO₂/N₂) / τ\n")
        f.write(f"Use τ = {results['tau_ns']:.3f} ns in your DAC ranking\n")
        f.write("=" * 60 + "\n")


def plot_msd(time_ps: np.ndarray, msd: np.ndarray,
             fit_start_ps: float, fit_end_ps: float,
             slope: float, intercept: float,
             output_path: str):
    """Generate MSD plot with linear fit."""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

        # Full MSD plot
        ax1.plot(time_ps, msd, 'b-', linewidth=0.5, alpha=0.7, label='MSD data')

        # Fit line
        t_fit = np.linspace(fit_start_ps, fit_end_ps, 100)
        msd_fit = slope * t_fit + intercept
        ax1.plot(t_fit, msd_fit, 'r-', linewidth=2, label=f'Linear fit (slope={slope:.4f} Å²/ps)')

        # Mark fit region
        ax1.axvline(fit_start_ps, color='g', linestyle='--', alpha=0.5)
        ax1.axvline(fit_end_ps, color='g', linestyle='--', alpha=0.5)

        ax1.set_xlabel('Time (ps)')
        ax1.set_ylabel('MSD (Å²)')
        ax1.set_title('CO₂ Mean Square Displacement in CALF-20 MOF')
        ax1.legend()
        ax1.grid(True, alpha=0.3)

        # Zoomed view of fit region
        mask = (time_ps >= fit_start_ps * 0.8) & (time_ps <= fit_end_ps * 1.2)
        ax2.plot(time_ps[mask], msd[mask], 'b-', linewidth=1, alpha=0.7, label='MSD data')
        ax2.plot(t_fit, msd_fit, 'r-', linewidth=2, label='Linear fit')
        ax2.axvline(fit_start_ps, color='g', linestyle='--', alpha=0.5, label='Fit region')
        ax2.axvline(fit_end_ps, color='g', linestyle='--', alpha=0.5)

        ax2.set_xlabel('Time (ps)')
        ax2.set_ylabel('MSD (Å²)')
        ax2.set_title(f'Linear Regime ({fit_start_ps:.0f}-{fit_end_ps:.0f} ps)')
        ax2.legend()
        ax2.grid(True, alpha=0.3)

        plt.tight_layout()
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        plt.close()
        print(f"Plot saved to: {output_path}")

    except ImportError:
        print("matplotlib not available, skipping plot generation")


def main():
    parser = argparse.ArgumentParser(description='Extract diffusion coefficient from MSD data')
    parser.add_argument('--msd-file', type=str, default='msd.dat',
                        help='Path to MSD data file (default: msd.dat)')
    parser.add_argument('--fit-start', type=float, default=100.0,
                        help='Start of linear fit region in ps (default: 100)')
    parser.add_argument('--fit-end', type=float, default=500.0,
                        help='End of linear fit region in ps (default: 500)')
    parser.add_argument('--length-scale', type=float, default=10.0,
                        help='Characteristic length scale L in Å for τ calculation (default: 10.0)')
    parser.add_argument('--output', type=str, default='diffusion_results.txt',
                        help='Output file for results (default: diffusion_results.txt)')
    parser.add_argument('--plot', type=str, default='msd_fit.png',
                        help='Output file for plot (default: msd_fit.png)')

    args = parser.parse_args()

    print("=" * 60)
    print("CO2 Self-Diffusion Coefficient Extraction")
    print("=" * 60)

    # Load data
    print(f"\nLoading MSD data from: {args.msd_file}")
    timestep, msd_x, msd_y, msd_z, msd_total = load_msd_data(args.msd_file)

    # Convert timestep (fs) to time (ps)
    time_ps = timestep / 1000.0

    print(f"Data range: 0 - {time_ps[-1]:.1f} ps ({len(time_ps)} points)")
    print(f"Final MSD: {msd_total[-1]:.4f} Å²")

    # Fit linear regime
    print(f"\nFitting linear regime: {args.fit_start} - {args.fit_end} ps")
    slope, intercept, r_squared = fit_linear_regime(
        time_ps, msd_total, args.fit_start, args.fit_end
    )

    print(f"Slope: {slope:.6f} Å²/ps")
    print(f"Intercept: {intercept:.6f} Å²")
    print(f"R²: {r_squared:.6f}")

    # Compute diffusion coefficient
    D = compute_diffusion_coefficient(slope)
    print(f"\nDiffusion coefficient:")
    print(f"  D = {D['D_angstrom2_ps']:.6e} Å²/ps")
    print(f"  D = {D['D_m2_s']:.6e} m²/s")
    print(f"  D = {D['D_cm2_s']:.6e} cm²/s")

    # Compute kinetic timescale
    tau = compute_kinetic_timescale(D['D_m2_s'], args.length_scale)
    print(f"\nKinetic timescale (L = {args.length_scale} Å):")
    print(f"  τ = {tau['tau_ns']:.3f} ns")

    # Compile results
    mask = (time_ps >= args.fit_start) & (time_ps <= args.fit_end)
    results = {
        'fit_start_ps': args.fit_start,
        'fit_end_ps': args.fit_end,
        'n_points': np.sum(mask),
        'r_squared': r_squared,
        'slope_angstrom2_ps': slope,
        'intercept_angstrom2': intercept,
        **D,
        **tau,
    }

    # Save results
    save_results(results, args.output)
    print(f"\nResults saved to: {args.output}")

    # Generate plot
    plot_msd(time_ps, msd_total, args.fit_start, args.fit_end,
             slope, intercept, args.plot)

    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == '__main__':
    main()

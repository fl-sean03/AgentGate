#!/usr/bin/env python3
"""
Combine MSD data from multiple replica simulations.

This script:
1. Loads MSD data from all replica directories
2. Computes mean and standard error across replicas
3. Performs linear fit on the combined data
4. Generates publication-quality plots

Usage:
    python combine_replicas.py [--n-replicas 8] [--fit-start 1000] [--fit-end 8000]
"""

import numpy as np
import argparse
from pathlib import Path
import glob


def load_replica_msd(replica_dir: Path, seed: int) -> np.ndarray:
    """Load MSD data from a single replica."""
    msd_file = replica_dir / f"msd_{seed}.dat"
    if not msd_file.exists():
        # Try alternative naming
        msd_files = list(replica_dir.glob("msd_*.dat"))
        if msd_files:
            msd_file = msd_files[0]
        else:
            raise FileNotFoundError(f"No MSD file found in {replica_dir}")

    data = np.loadtxt(msd_file, comments='#')
    return data


def combine_msd_data(base_dir: Path, n_replicas: int) -> tuple:
    """Load and combine MSD data from all replicas."""
    all_msd = []
    seeds = []

    for i in range(1, n_replicas + 1):
        replica_dir = base_dir / f"replica_{i}"
        seed = 10000 + i * 1111

        if not replica_dir.exists():
            print(f"Warning: {replica_dir} not found, skipping")
            continue

        try:
            data = load_replica_msd(replica_dir, seed)
            all_msd.append(data)
            seeds.append(seed)
            print(f"Loaded replica {i} (seed={seed}): {len(data)} points")
        except Exception as e:
            print(f"Error loading replica {i}: {e}")

    if not all_msd:
        raise RuntimeError("No replica data found!")

    # Stack and compute statistics
    # Assuming all replicas have same time points
    msd_stack = np.stack([d[:, 4] for d in all_msd], axis=0)  # MSD_total
    time = all_msd[0][:, 0]  # Timestep (fs)

    msd_mean = np.mean(msd_stack, axis=0)
    msd_std = np.std(msd_stack, axis=0)
    msd_sem = msd_std / np.sqrt(len(all_msd))  # Standard error of mean

    return time, msd_mean, msd_std, msd_sem, len(all_msd)


def fit_linear_regime(time_ps: np.ndarray, msd: np.ndarray, msd_err: np.ndarray,
                      fit_start_ps: float, fit_end_ps: float) -> dict:
    """Fit linear regime with error estimation."""
    mask = (time_ps >= fit_start_ps) & (time_ps <= fit_end_ps)
    t_fit = time_ps[mask]
    msd_fit = msd[mask]
    err_fit = msd_err[mask]

    # Weighted linear fit (weights = 1/sigma^2)
    weights = 1.0 / (err_fit**2 + 1e-10)  # Avoid division by zero

    # Weighted least squares
    W = np.sum(weights)
    Wx = np.sum(weights * t_fit)
    Wy = np.sum(weights * msd_fit)
    Wxx = np.sum(weights * t_fit**2)
    Wxy = np.sum(weights * t_fit * msd_fit)

    denom = W * Wxx - Wx**2
    slope = (W * Wxy - Wx * Wy) / denom
    intercept = (Wxx * Wy - Wx * Wxy) / denom

    # Error in slope
    slope_err = np.sqrt(W / denom)

    # R² calculation
    msd_pred = slope * t_fit + intercept
    ss_res = np.sum((msd_fit - msd_pred)**2)
    ss_tot = np.sum((msd_fit - np.mean(msd_fit))**2)
    r_squared = 1 - (ss_res / ss_tot)

    # Diffusion coefficient
    D = slope / 6.0  # Å²/ps
    D_err = slope_err / 6.0

    return {
        'slope': slope,
        'slope_err': slope_err,
        'intercept': intercept,
        'r_squared': r_squared,
        'D_angstrom2_ps': D,
        'D_err_angstrom2_ps': D_err,
        'D_m2_s': D * 1e-8,
        'D_err_m2_s': D_err * 1e-8,
        'n_points': np.sum(mask),
    }


def plot_combined_msd(time_ps, msd_mean, msd_sem, fit_result,
                      fit_start_ps, fit_end_ps, n_replicas, output_path):
    """Generate publication-quality MSD plot."""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

        # Left: Full MSD with error bands
        ax1.fill_between(time_ps, msd_mean - msd_sem, msd_mean + msd_sem,
                        alpha=0.3, color='blue', label='±SEM')
        ax1.plot(time_ps, msd_mean, 'b-', linewidth=1, label=f'Mean ({n_replicas} replicas)')

        # Fit line
        t_fit = np.linspace(fit_start_ps, fit_end_ps, 100)
        msd_fit = fit_result['slope'] * t_fit + fit_result['intercept']
        ax1.plot(t_fit, msd_fit, 'r-', linewidth=2,
                label=f"Fit: D = {fit_result['D_m2_s']:.2e} m²/s")

        ax1.axvline(fit_start_ps, color='g', linestyle='--', alpha=0.5)
        ax1.axvline(fit_end_ps, color='g', linestyle='--', alpha=0.5)

        ax1.set_xlabel('Time (ps)', fontsize=12)
        ax1.set_ylabel('MSD (Å²)', fontsize=12)
        ax1.set_title('CO₂ MSD in CALF-20 MOF (Combined Replicas)', fontsize=12)
        ax1.legend(loc='upper left')
        ax1.grid(True, alpha=0.3)

        # Right: Log-log plot to identify diffusion regimes
        ax2.loglog(time_ps[1:], msd_mean[1:], 'b-', linewidth=1, label='MSD data')

        # Reference lines
        t_ref = np.logspace(0, np.log10(time_ps[-1]), 100)
        ax2.loglog(t_ref, 0.01 * t_ref**2, 'g--', alpha=0.5, label='Ballistic (∝t²)')
        ax2.loglog(t_ref, 0.1 * t_ref, 'r--', alpha=0.5, label='Diffusive (∝t)')
        ax2.loglog(t_ref, 2 * np.ones_like(t_ref), 'k--', alpha=0.5, label='Caged (plateau)')

        ax2.set_xlabel('Time (ps)', fontsize=12)
        ax2.set_ylabel('MSD (Å²)', fontsize=12)
        ax2.set_title('Log-Log Plot (Regime Identification)', fontsize=12)
        ax2.legend(loc='lower right')
        ax2.grid(True, alpha=0.3)

        plt.tight_layout()
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        plt.close()
        print(f"Plot saved: {output_path}")

    except ImportError:
        print("matplotlib not available, skipping plot")


def main():
    parser = argparse.ArgumentParser(description='Combine replica MSD data')
    parser.add_argument('--n-replicas', type=int, default=8,
                        help='Number of replicas (default: 8)')
    parser.add_argument('--fit-start', type=float, default=1000,
                        help='Start of fit region in ps (default: 1000)')
    parser.add_argument('--fit-end', type=float, default=8000,
                        help='End of fit region in ps (default: 8000)')
    parser.add_argument('--length-scale', type=float, default=10.0,
                        help='Length scale L in Å for τ calculation')
    parser.add_argument('--base-dir', type=str, default='.',
                        help='Base directory containing replica_N folders')

    args = parser.parse_args()
    base_dir = Path(args.base_dir)

    print("=" * 60)
    print("Combining MSD Data from Replica Simulations")
    print("=" * 60)

    # Load and combine data
    time_fs, msd_mean, msd_std, msd_sem, n_loaded = combine_msd_data(
        base_dir, args.n_replicas
    )
    time_ps = time_fs / 1000.0

    print(f"\nLoaded {n_loaded} replicas")
    print(f"Time range: 0 - {time_ps[-1]:.1f} ps")
    print(f"Final MSD: {msd_mean[-1]:.3f} ± {msd_sem[-1]:.3f} Å²")

    # Fit linear regime
    print(f"\nFitting range: {args.fit_start} - {args.fit_end} ps")
    fit_result = fit_linear_regime(time_ps, msd_mean, msd_sem,
                                   args.fit_start, args.fit_end)

    print(f"Slope: {fit_result['slope']:.6f} ± {fit_result['slope_err']:.6f} Å²/ps")
    print(f"R²: {fit_result['r_squared']:.4f}")
    print(f"\nD = {fit_result['D_m2_s']:.3e} ± {fit_result['D_err_m2_s']:.3e} m²/s")

    # Kinetic timescale
    L_m = args.length_scale * 1e-10
    tau_s = L_m**2 / fit_result['D_m2_s']
    tau_err_s = tau_s * (fit_result['D_err_m2_s'] / fit_result['D_m2_s'])
    print(f"\nτ (L={args.length_scale} Å) = {tau_s*1e9:.1f} ± {tau_err_s*1e9:.1f} ns")

    # Save combined data
    combined_file = base_dir / 'msd_combined.dat'
    np.savetxt(combined_file,
               np.column_stack([time_fs, msd_mean, msd_std, msd_sem]),
               header='TimeStep(fs) MSD_mean(A^2) MSD_std MSD_sem',
               fmt='%.6e')
    print(f"\nCombined data saved: {combined_file}")

    # Save results
    results_file = base_dir / 'diffusion_combined_results.txt'
    with open(results_file, 'w') as f:
        f.write("=" * 60 + "\n")
        f.write("Combined Replica Analysis Results\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"Replicas loaded: {n_loaded}\n")
        f.write(f"Fit range: {args.fit_start} - {args.fit_end} ps\n")
        f.write(f"R²: {fit_result['r_squared']:.4f}\n\n")
        f.write(f"D = {fit_result['D_m2_s']:.3e} ± {fit_result['D_err_m2_s']:.3e} m²/s\n")
        f.write(f"τ = {tau_s*1e9:.1f} ± {tau_err_s*1e9:.1f} ns (L={args.length_scale} Å)\n")
    print(f"Results saved: {results_file}")

    # Plot
    plot_combined_msd(time_ps, msd_mean, msd_sem, fit_result,
                      args.fit_start, args.fit_end, n_loaded,
                      base_dir / 'msd_combined.png')

    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == '__main__':
    main()

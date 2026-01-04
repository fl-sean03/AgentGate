#!/usr/bin/env python3
"""
Compare MSD data between free CO2 and MOF-confined CO2.
Generates publication-quality comparison plots.
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path

# File paths
FREE_CO2_MSD = Path("/home/sf2/LabWork/Workspace/27-PMOS/5-CampaignBuilder/2-CB/lammps_reaper/workspaces/co2-only-27/msd.dat")
MOF_CO2_MSD = Path("/home/sf2/LabWork/Workspace/27-PMOS/5-CampaignBuilder/2-CB/lammps_reaper/workspaces/calf20-co2-diffusion/msd.dat")
OUTPUT_DIR = Path("/home/sf2/LabWork/Workspace/27-PMOS/5-CampaignBuilder/2-CB/workspaces/calf20-co2-diffusion")

def load_msd(filepath):
    """Load MSD data from LAMMPS output."""
    data = np.loadtxt(filepath, comments='#')
    time_ps = data[:, 0] / 1000.0  # Convert fs to ps
    msd_total = data[:, 4]  # Total MSD in Å²
    return time_ps, msd_total

# Load data
print("Loading data...")
time_free, msd_free = load_msd(FREE_CO2_MSD)
time_mof, msd_mof = load_msd(MOF_CO2_MSD)

# Normalize free CO2 MSD to start from ~0 (subtract initial offset)
msd_free_normalized = msd_free - msd_free[0]

print(f"Free CO2: {len(time_free)} points, final MSD = {msd_free[-1]:.1f} Å²")
print(f"MOF CO2:  {len(time_mof)} points, final MSD = {msd_mof[-1]:.1f} Å²")

# Set up style
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['font.size'] = 11
plt.rcParams['axes.labelsize'] = 12
plt.rcParams['axes.titlesize'] = 13
plt.rcParams['legend.fontsize'] = 10

# ==============================================================================
# PLOT 1: Side-by-side comparison (different y-scales)
# ==============================================================================
fig1, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

# Free CO2
ax1.plot(time_free, msd_free_normalized, 'b-', linewidth=1.5, alpha=0.8)
ax1.set_xlabel('Time (ps)')
ax1.set_ylabel('MSD (Ų)')
ax1.set_title('Free CO₂ (No MOF)\nD = 1.86 × 10⁻⁷ m²/s')
ax1.set_xlim(0, 1000)
ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))

# Add fit line for free CO2
slope_free = 111.7  # Å²/ps from fitting
t_fit = np.linspace(100, 900, 100)
ax1.plot(t_fit, slope_free * t_fit, 'r--', linewidth=2, alpha=0.7, label=f'Linear fit (R²=0.94)')
ax1.legend(loc='upper left')

# MOF CO2
ax2.plot(time_mof, msd_mof, 'g-', linewidth=1.5, alpha=0.8)
ax2.set_xlabel('Time (ps)')
ax2.set_ylabel('MSD (Ų)')
ax2.set_title('CO₂ in CALF-20 MOF\nD = 6.14 × 10⁻¹² m²/s')
ax2.set_xlim(0, 1000)

# Add fit line for MOF CO2
slope_mof = 0.00368  # Å²/ps from fitting
t_fit_mof = np.linspace(200, 500, 100)
ax2.plot(t_fit_mof, slope_mof * t_fit_mof + 1.3, 'r--', linewidth=2, alpha=0.7, label=f'Linear fit (R²=0.60)')
ax2.legend(loc='upper left')

plt.suptitle('CO₂ Diffusion: Free vs MOF-Confined', fontsize=14, fontweight='bold', y=1.02)
plt.tight_layout()
plt.savefig(OUTPUT_DIR / 'comparison_side_by_side.png', dpi=150, bbox_inches='tight')
plt.close()
print("Saved: comparison_side_by_side.png")

# ==============================================================================
# PLOT 2: Overlaid on same axes (normalized, log scale)
# ==============================================================================
fig2, ax = plt.subplots(figsize=(10, 6))

ax.semilogy(time_free, msd_free_normalized + 0.1, 'b-', linewidth=2, alpha=0.8,
            label=f'Free CO₂ (D = 1.86×10⁻⁷ m²/s)')
ax.semilogy(time_mof, msd_mof + 0.1, 'g-', linewidth=2, alpha=0.8,
            label=f'MOF-Confined (D = 6.14×10⁻¹² m²/s)')

ax.set_xlabel('Time (ps)')
ax.set_ylabel('MSD (Ų) [log scale]')
ax.set_title('CO₂ Mean Square Displacement: Free vs CALF-20 MOF', fontweight='bold')
ax.set_xlim(0, 1000)
ax.legend(loc='lower right', fontsize=11)

# Add annotation for confinement factor
ax.annotate('30,000× slower\nin MOF',
            xy=(500, 10), fontsize=12,
            ha='center', va='center',
            bbox=dict(boxstyle='round', facecolor='yellow', alpha=0.7))

plt.tight_layout()
plt.savefig(OUTPUT_DIR / 'comparison_overlay_log.png', dpi=150, bbox_inches='tight')
plt.close()
print("Saved: comparison_overlay_log.png")

# ==============================================================================
# PLOT 3: Dual y-axis overlay (linear scale, same time axis)
# ==============================================================================
fig3, ax1 = plt.subplots(figsize=(10, 6))

color1 = '#1f77b4'  # Blue
color2 = '#2ca02c'  # Green

# Free CO2 on left axis
ax1.set_xlabel('Time (ps)', fontsize=12)
ax1.set_ylabel('Free CO₂ MSD (Ų)', color=color1, fontsize=12)
line1, = ax1.plot(time_free, msd_free_normalized, color=color1, linewidth=2, alpha=0.8, label='Free CO₂')
ax1.tick_params(axis='y', labelcolor=color1)
ax1.set_xlim(0, 1000)
ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))

# MOF CO2 on right axis
ax2 = ax1.twinx()
ax2.set_ylabel('MOF-Confined MSD (Ų)', color=color2, fontsize=12)
line2, = ax2.plot(time_mof, msd_mof, color=color2, linewidth=2, alpha=0.8, label='CALF-20 MOF')
ax2.tick_params(axis='y', labelcolor=color2)

# Combined legend
lines = [line1, line2]
labels = ['Free CO₂ (D = 1.86×10⁻⁷ m²/s)', 'CALF-20 MOF (D = 6.14×10⁻¹² m²/s)']
ax1.legend(lines, labels, loc='upper left', fontsize=10)

plt.title('CO₂ Diffusion Comparison\n(Note: Different Y-scales — 30,000× difference)', fontweight='bold')
plt.tight_layout()
plt.savefig(OUTPUT_DIR / 'comparison_dual_axis.png', dpi=150, bbox_inches='tight')
plt.close()
print("Saved: comparison_dual_axis.png")

# ==============================================================================
# PLOT 4: Bar chart comparing D values
# ==============================================================================
fig4, ax = plt.subplots(figsize=(8, 6))

systems = ['Free CO₂\n(gas phase)', 'CALF-20 + CO₂\n(confined)']
D_values = [1.86e-7, 6.14e-12]  # m²/s
colors = ['#1f77b4', '#2ca02c']

bars = ax.bar(systems, D_values, color=colors, edgecolor='black', linewidth=1.5)
ax.set_ylabel('Diffusion Coefficient D (m²/s)', fontsize=12)
ax.set_yscale('log')
ax.set_ylim(1e-13, 1e-6)
ax.set_title('Self-Diffusion Coefficient Comparison', fontweight='bold', fontsize=13)

# Add value labels on bars
for bar, val in zip(bars, D_values):
    height = bar.get_height()
    ax.annotate(f'{val:.2e}',
                xy=(bar.get_x() + bar.get_width() / 2, height),
                xytext=(0, 5), textcoords="offset points",
                ha='center', va='bottom', fontsize=11, fontweight='bold')

# Add confinement factor annotation
ax.annotate('', xy=(0.15, 1e-7), xytext=(0.85, 6e-12),
            arrowprops=dict(arrowstyle='<->', color='red', lw=2))
ax.text(0.5, 1e-9, '30,000×\nslower', ha='center', va='center', fontsize=12,
        color='red', fontweight='bold',
        bbox=dict(boxstyle='round', facecolor='white', edgecolor='red', alpha=0.9))

plt.tight_layout()
plt.savefig(OUTPUT_DIR / 'comparison_D_bar.png', dpi=150, bbox_inches='tight')
plt.close()
print("Saved: comparison_D_bar.png")

# ==============================================================================
# PLOT 5: Combined summary figure
# ==============================================================================
fig5 = plt.figure(figsize=(14, 10))

# Top left: Free CO2 MSD
ax1 = fig5.add_subplot(2, 2, 1)
ax1.plot(time_free, msd_free_normalized, 'b-', linewidth=1.5, alpha=0.8)
ax1.plot(t_fit, slope_free * t_fit, 'r--', linewidth=2, alpha=0.7)
ax1.set_xlabel('Time (ps)')
ax1.set_ylabel('MSD (Ų)')
ax1.set_title('Free CO₂', fontweight='bold')
ax1.ticklabel_format(style='scientific', axis='y', scilimits=(0,0))
ax1.text(0.05, 0.95, f'D = 1.86×10⁻⁷ m²/s\nR² = 0.94', transform=ax1.transAxes,
         fontsize=10, verticalalignment='top', bbox=dict(boxstyle='round', facecolor='wheat'))

# Top right: MOF CO2 MSD
ax2 = fig5.add_subplot(2, 2, 2)
ax2.plot(time_mof, msd_mof, 'g-', linewidth=1.5, alpha=0.8)
ax2.set_xlabel('Time (ps)')
ax2.set_ylabel('MSD (Ų)')
ax2.set_title('CO₂ in CALF-20 MOF', fontweight='bold')
ax2.text(0.05, 0.95, f'D = 6.14×10⁻¹² m²/s\nR² = 0.60', transform=ax2.transAxes,
         fontsize=10, verticalalignment='top', bbox=dict(boxstyle='round', facecolor='lightgreen'))

# Bottom left: Log overlay
ax3 = fig5.add_subplot(2, 2, 3)
ax3.semilogy(time_free, msd_free_normalized + 0.1, 'b-', linewidth=2, alpha=0.8, label='Free')
ax3.semilogy(time_mof, msd_mof + 0.1, 'g-', linewidth=2, alpha=0.8, label='MOF')
ax3.set_xlabel('Time (ps)')
ax3.set_ylabel('MSD (Ų) [log]')
ax3.set_title('Overlay (Log Scale)', fontweight='bold')
ax3.legend()

# Bottom right: D comparison bar
ax4 = fig5.add_subplot(2, 2, 4)
bars = ax4.bar(systems, D_values, color=colors, edgecolor='black', linewidth=1.5)
ax4.set_ylabel('D (m²/s)')
ax4.set_yscale('log')
ax4.set_ylim(1e-13, 1e-6)
ax4.set_title('Diffusion Coefficient', fontweight='bold')
ax4.text(0.5, 1e-9, '30,000×', ha='center', va='center', fontsize=14,
        color='red', fontweight='bold')

plt.suptitle('CO₂ Diffusion: Free vs MOF-Confined (CALF-20)\n1 ns NVT @ 298K, 27 molecules',
             fontsize=14, fontweight='bold', y=1.02)
plt.tight_layout()
plt.savefig(OUTPUT_DIR / 'comparison_summary.png', dpi=150, bbox_inches='tight')
plt.close()
print("Saved: comparison_summary.png")

print("\n" + "="*60)
print("All comparison plots saved to:")
print(OUTPUT_DIR)
print("="*60)

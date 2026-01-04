# Background: Computational Chemistry for AI Agents

This document provides comprehensive domain context for AI agents working with computational chemistry simulations. Understanding these concepts is essential for building valid simulation input decks and avoiding critical errors that would produce scientifically meaningless results.

---

## Why This Document Exists

Campaign Builder generates simulation input files for computational chemistry. Unlike text generation where errors are cosmetic, simulation errors produce scientifically meaningless results that waste computational resources and lead to incorrect conclusions. An AI agent generating these files must understand:

- What each parameter physically means
- Why certain combinations are valid or invalid
- What information must come from input files versus what can be defaulted
- How to recognize when critical information is missing

This document provides that foundational understanding.

---

## The Two Worlds of Computational Chemistry

Computational chemistry uses computer simulations to study molecular systems. There are two fundamentally different approaches, each with its own simulation engine, file formats, and requirements.

### Molecular Dynamics (MD) - The Classical World

Molecular dynamics treats atoms as classical particles obeying Newton's equations of motion. Given the positions and velocities of all atoms at time t, MD calculates the forces between atoms and uses those forces to predict where the atoms will be at time t+dt, where dt is a small timestep (typically 1-2 femtoseconds).

**Physical Picture:** Imagine billions of tiny billiard balls connected by springs, bouncing off each other according to simple rules. The "rules" are called the force field - a mathematical description of how atoms interact based on their types and distances.

**What MD Can Calculate:**
- Thermodynamic properties (energy, pressure, temperature)
- Structural properties (radial distribution functions, coordination numbers)
- Dynamic properties (diffusion coefficients, viscosity)
- Mechanical properties (elastic constants, stress-strain relationships)

**Key Limitation:** MD knows nothing about electrons. It cannot describe bond breaking/forming, electronic excitation, or systems where quantum effects are important. The force field must be specified in advance - MD cannot determine what interactions exist, only simulate them.

**Primary Engine for Campaign Builder:** LAMMPS (Large-scale Atomic/Molecular Massively Parallel Simulator)

### Density Functional Theory (DFT) - The Quantum World

DFT is a quantum mechanical method that calculates the electronic structure of a system by solving the Schrödinger equation approximately. Rather than tracking individual electrons (computationally impossible for more than a few atoms), DFT uses the electron density - a simpler quantity that still contains all necessary information.

**Physical Picture:** DFT asks "given these atomic nuclei at these positions, where do the electrons want to be and what is the total energy?" It self-consistently finds the electron density that minimizes the total energy.

**What DFT Can Calculate:**
- Ground state energies and geometries
- Electronic band structures
- Phonon spectra and vibrational properties
- Reaction barriers and transition states
- Magnetic properties

**Key Limitation:** DFT is computationally expensive. Typical calculations are limited to hundreds or at most a few thousand atoms, and simulating dynamics is limited to picoseconds. It also requires specifying pseudopotentials (approximations for core electrons) and cutoff energies (basis set size).

**Primary Engine for Campaign Builder:** Quantum ESPRESSO

---

## Molecular Dynamics: Core Concepts

### Atoms and Atom Types

In MD, every atom belongs to an "atom type" - a category that determines its properties and interactions. Two carbon atoms might have different types if they are in different chemical environments:

**Example Atom Types in a Protein:**
- Type 1: Backbone carbon (C_alpha) - mass 12.011 g/mol
- Type 2: Carbonyl carbon (C=O) - mass 12.011 g/mol, different charge
- Type 3: Aromatic carbon - mass 12.011 g/mol, different interaction parameters
- Type 4: Backbone nitrogen - mass 14.007 g/mol
- Type 5: Hydrogen bonded to carbon - mass 1.008 g/mol
- Type 6: Hydrogen bonded to nitrogen - mass 1.008 g/mol, different charge

**What Each Atom Type Specifies:**
- Mass (in g/mol for "real" units)
- Partial charge (for electrostatic interactions)
- Lennard-Jones parameters (ε and σ for van der Waals interactions)
- Which bonds, angles, and dihedrals it can participate in

**Critical Understanding:** The atom type numbering is arbitrary and defined within each data file. Type 1 in one file might mean carbon, while Type 1 in another file means oxygen. The FileAnalyzer must read the Masses section to understand what each type represents.

### Force Fields

A force field is the complete mathematical description of all atomic interactions in a system. It has two components:

**Non-Bonded Interactions (between any two atoms):**

The most common is the Lennard-Jones potential combined with Coulombic electrostatics. For two atoms i and j:
- The Lennard-Jones potential depends on ε (epsilon, energy depth) and σ (sigma, distance parameter)
- The Coulombic potential depends on partial charges q_i and q_j

**Bonded Interactions (between connected atoms):**
- Bonds: Two-atom harmonic spring with equilibrium distance and spring constant
- Angles: Three-atom harmonic potential with equilibrium angle
- Dihedrals: Four-atom torsional potential (can be harmonic, OPLS, CHARMM style)
- Impropers: Four-atom potential to maintain planarity

**Published Force Field Families:**

| Force Field | Target Systems | Notable Features |
|-------------|----------------|------------------|
| OPLS-AA | Small organic molecules | All-atom, good for organics |
| CHARMM | Proteins, nucleic acids | Extensive biomolecular parameters |
| AMBER | Proteins, nucleic acids | Similar to CHARMM, different philosophy |
| UFF | Universal | Covers entire periodic table, less accurate |
| ReaxFF | Reactive systems | Allows bond breaking/forming |
| TraPPE | Phase equilibria | Optimized for vapor-liquid properties |
| Dreiding | General organics | Simple rules-based parameters |

**The Cardinal Rule:** Force field parameters must come from established sources. They are carefully fitted to experimental or quantum mechanical data. Inventing parameters produces meaningless results. Campaign Builder must never guess these values - they must be extracted from user-provided files or explicitly specified by the user.

### Units Systems

LAMMPS supports multiple unit systems. The choice of units affects how every parameter must be specified. The three most common:

**Real Units (Most Common for Molecular Systems):**
- Length: Angstroms (Å)
- Time: Femtoseconds (fs)
- Energy: kcal/mol
- Mass: g/mol
- Temperature: Kelvin
- Pressure: atmospheres
- Charge: Elementary charges

**Metal Units (Common for Materials Science):**
- Length: Angstroms
- Time: Picoseconds (ps)
- Energy: Electron-volts (eV)
- Mass: g/mol
- Temperature: Kelvin
- Pressure: bar
- Charge: Elementary charges

**LJ Units (Reduced Units for Theory):**
- All quantities expressed relative to σ and ε
- Useful for universal scaling arguments
- Common in theoretical studies

**Critical Understanding:** All parameters in a simulation must be in the same unit system. A force constant of 350 kcal/mol/Å² in real units is completely different from the same number in metal units. FileAnalyzer must identify the units command and ensure all extracted parameters are interpreted correctly.

### The Simulation Box

Every MD simulation takes place in a box with specified dimensions and boundary conditions.

**Box Dimensions:**
- Orthogonal box: xlo/xhi, ylo/yhi, zlo/zhi (6 numbers)
- Triclinic box: Also includes xy, xz, yz tilt factors (9 numbers)
- Box size must be large enough that atoms don't interact with their periodic images

**Boundary Conditions:**
- Periodic (p): Atoms exiting one side re-enter the opposite side
- Fixed (f): Hard wall boundary
- Shrink-wrap (s): Box boundary follows the outermost atoms

**Minimum Image Convention:** For periodic boundaries, each atom interacts with the closest image of every other atom. This means the interaction cutoff must be less than half the smallest box dimension. Violating this produces incorrect energies and forces.

### Statistical Ensembles

MD can simulate different thermodynamic conditions by controlling which quantities are fixed:

**NVE (Microcanonical):**
- Fixed: Number of atoms, Volume, Energy
- Nothing is controlled - pure Newtonian dynamics
- Use for: Production runs after equilibration, measuring diffusion

**NVT (Canonical):**
- Fixed: Number of atoms, Volume, Temperature
- Thermostat controls temperature
- Use for: Equilibration, constant-temperature properties

**NPT (Isothermal-Isobaric):**
- Fixed: Number of atoms, Pressure, Temperature
- Thermostat and barostat control conditions
- Use for: Finding equilibrium density, phase transitions

**Thermostats and Barostats:**
- Nosé-Hoover: Deterministic, produces correct ensemble, standard choice
- Berendsen: Faster equilibration but wrong fluctuations, use only for equilibration
- Langevin: Stochastic, mimics solvent friction
- Damping parameters control how strongly the thermostat/barostat acts

---

## LAMMPS File Formats

### Data File Structure (.data, .lmp)

The LAMMPS data file contains the complete structural description of a molecular system. Understanding its sections is crucial for FileAnalyzer:

**Header Section:**
The first part contains counts and box dimensions:
- Number of atoms, bonds, angles, dihedrals, impropers
- Number of each type (atom types, bond types, etc.)
- Box dimensions (xlo xhi, ylo yhi, zlo zhi)
- Optional tilt factors for triclinic boxes

**Masses Section:**
Maps each atom type ID to its mass. This is essential for understanding what each type represents. The comment after each mass often indicates the element or atom type name.

**Pair Coeffs Section:**
The force field parameters for non-bonded interactions. Format depends on pair style:
- For lj/cut: type, epsilon, sigma
- For lj/cut/coul/long: type, epsilon, sigma (charges in Atoms section)
- For hybrid styles: type, style, parameters

**Bond Coeffs, Angle Coeffs, Dihedral Coeffs Sections:**
Parameters for bonded interactions. Format depends on the respective style.

**Atoms Section:**
The actual atomic coordinates. Format depends on atom_style:
- full: atom-ID molecule-ID type charge x y z
- atomic: atom-ID type x y z
- charge: atom-ID type q x y z
- molecular: atom-ID molecule-ID type x y z

**Bonds, Angles, Dihedrals Sections:**
Topology connectivity. Lists which atoms are bonded to which.

**What FileAnalyzer Should Extract:**
- All header counts and box dimensions
- Complete Masses section with comments
- Complete Pair Coeffs section
- Complete Bond/Angle/Dihedral Coeffs sections
- The atom_style indicator (from Atoms section comment)

**What FileAnalyzer Should Skip:**
- Atoms section coordinates (just note the count matches header)
- Bonds/Angles/Dihedrals sections (just note counts match)
- Velocities section if present

### Input Script Structure (.in, .lammps)

The input script contains commands that control the simulation. Key command categories:

**Initialization Commands:**
- units: Specifies the unit system (must be first command)
- atom_style: How atoms are described (full, atomic, charge, etc.)
- boundary: Boundary conditions for each dimension

**System Definition:**
- read_data: Loads structure from data file
- read_restart: Resumes from checkpoint
- region/create_box/create_atoms: Build system from scratch

**Force Field Commands:**
- pair_style: Type of non-bonded interactions
- pair_coeff: Parameters for specific type pairs
- bond_style/bond_coeff: Bond parameters
- kspace_style: Long-range electrostatics method

**Settings:**
- neighbor/neigh_modify: Neighbor list parameters
- timestep: Integration timestep

**Fixes (Time Integration and Constraints):**
- fix nve/nvt/npt: Time integration with ensemble
- fix shake/rattle: Constrain bond lengths
- fix setforce/freeze: Apply constraints

**Output:**
- thermo: Print thermodynamic info
- dump: Write trajectories
- compute: Calculate quantities
- variable: Define variables

**Run Commands:**
- minimize: Energy minimization
- run: Time integration
- velocity: Initialize velocities

---

## Density Functional Theory: Core Concepts

### The Quantum Mechanical Problem

DFT solves for the ground state electron density of a system. Given atomic positions, it finds the electron distribution that minimizes total energy. This requires:

1. An exchange-correlation functional (approximation for electron-electron interactions)
2. Pseudopotentials (replacing core electrons with effective potentials)
3. A basis set (how wavefunctions are represented)
4. Convergence parameters

### Exchange-Correlation Functionals

The functional is the heart of DFT - it approximates the complex electron-electron interactions:

**Local Density Approximation (LDA):**
- Depends only on local electron density
- Oldest and simplest
- Tends to overbind (too short bonds, too high energies)

**Generalized Gradient Approximation (GGA):**
- Includes density gradient
- PBE (Perdew-Burke-Ernzerhof) is the most widely used
- Good balance of accuracy and cost

**Meta-GGA:**
- Includes kinetic energy density
- SCAN is a modern accurate choice
- More expensive than GGA

**Hybrid Functionals:**
- Mix DFT exchange with exact Hartree-Fock exchange
- PBE0, B3LYP, HSE06 are common
- Better for band gaps, much more expensive

**van der Waals Corrections:**
- DFT-D3, DFT-D4: Empirical dispersion corrections
- vdW-DF: Non-local correlation functional
- Essential for weakly bound systems (MOFs, layered materials)

### Pseudopotentials

Core electrons (1s, 2s, 2p for heavy elements) are chemically inert but computationally expensive to treat. Pseudopotentials replace them with an effective potential:

**Types of Pseudopotentials:**
- Norm-conserving: Wavefunction matches all-electron outside cutoff radius
- Ultrasoft: Relaxes norm conservation for efficiency
- PAW (Projector Augmented Wave): Most accurate, reconstructs all-electron wavefunction

**Naming Conventions:**
- Example: C.pbe-n-kjpaw_psl.1.0.0.UPF
- Element.functional-valence-type_library.version.format
- The functional in the filename MUST match the calculation's functional

**Critical Understanding:**
- Every element in the structure needs a pseudopotential file
- All pseudopotentials must use the same functional (all PBE or all LDA)
- The cutoff energy depends on the pseudopotential, not the element

### Cutoff Energies

Plane-wave DFT represents wavefunctions as sums of plane waves. The cutoff energy determines how many plane waves:

**Wavefunction Cutoff (ecutwfc):**
- The kinetic energy cutoff for wavefunctions
- Typical range: 30-80 Ry depending on pseudopotential
- Higher = more accurate but more expensive

**Charge Density Cutoff (ecutrho):**
- Controls the density representation
- For norm-conserving: 4 × ecutwfc
- For ultrasoft/PAW: 8-12 × ecutwfc

**How to Choose Cutoffs:**
- Pseudopotential documentation often suggests values
- Convergence testing: Run with increasing cutoff until energy changes < 1 meV/atom
- Harder elements (transition metals, oxygen) need higher cutoffs

### K-Point Sampling

In periodic systems, electronic states are labeled by wavevector k. K-point sampling determines how finely the Brillouin zone is sampled:

**Monkhorst-Pack Grids:**
- Regular grid in reciprocal space: N × N × N
- More points = better sampling = more expensive
- Gamma-centered vs shifted grids

**Rules of Thumb:**
- Metals: Dense sampling (12×12×12 or more)
- Semiconductors: Moderate (6×6×6 to 8×8×8)
- Insulators/molecules: Sparse (4×4×4 or even gamma-only)
- Large supercells: Fewer k-points needed

**For Molecular Systems and Large Cells:**
- Gamma-point only may be sufficient
- The k-point requirement scales inversely with cell size

### Calculation Types

**SCF (Self-Consistent Field):**
- Single-point energy calculation
- Iterates until electron density converges
- Starting point for all other calculations

**Relaxation:**
- relax: Optimize atomic positions, fixed cell
- vc-relax: Optimize positions AND cell shape/volume
- Convergence based on forces and/or pressure

**Band Structure:**
- First: SCF to get charge density
- Then: nscf along high-symmetry k-path
- Produces electronic band structure for visualization

**Density of States:**
- Similar to band structure but on dense k-grid
- nscf calculation followed by post-processing

**Molecular Dynamics:**
- Born-Oppenheimer MD: Forces from DFT at each step
- Car-Parrinello MD: Wavefunctions propagated simultaneously
- Very expensive - limited to picoseconds

---

## Quantum ESPRESSO File Format

### Input File Structure (.pwi, .in)

QE input files consist of Fortran namelists and data cards:

**&CONTROL Namelist:**
- calculation: Type (scf, relax, vc-relax, md, bands, nscf)
- prefix: Job name for output files
- outdir: Directory for temporary files
- pseudo_dir: Location of pseudopotential files
- tprnfor: Print forces
- tstress: Print stress tensor

**&SYSTEM Namelist:**
- ibrav: Bravais lattice type (0 for general cell)
- celldm(1-6) or A, B, C, cosAB, cosAC, cosBC: Cell parameters
- nat: Number of atoms
- ntyp: Number of species
- ecutwfc: Wavefunction cutoff
- ecutrho: Density cutoff
- occupations, smearing, degauss: For metals

**&ELECTRONS Namelist:**
- conv_thr: SCF convergence threshold
- mixing_beta: Charge mixing factor
- electron_maxstep: Maximum SCF iterations

**&IONS Namelist (for relaxation/MD):**
- ion_dynamics: Algorithm (bfgs, damp, verlet)

**&CELL Namelist (for vc-relax):**
- cell_dynamics: How cell changes
- press: Target pressure

**ATOMIC_SPECIES Card:**
- Element symbol, mass, pseudopotential filename

**ATOMIC_POSITIONS Card:**
- Positions in angstrom, bohr, or crystal coordinates
- Optional fixed/moving flags

**K_POINTS Card:**
- automatic: Monkhorst-Pack grid
- gamma: Gamma point only
- crystal/tpiba: Explicit list

**CELL_PARAMETERS Card (if ibrav=0):**
- Three lattice vectors

---

## File Types Reference

### Structure File Formats

**LAMMPS Data File (.data, .lmp):**
- Complete system definition for MD
- Contains: topology, masses, charges, coordinates, force field coefficients
- FileAnalyzer priority: HIGH - extract all non-coordinate sections

**POSCAR/CONTCAR (.vasp, POSCAR, CONTCAR):**
- VASP structure format, also used by QE
- Contains: lattice vectors, species, positions
- Selective dynamics possible (T/F flags)
- FileAnalyzer: Extract lattice, species, counts

**CIF (Crystallographic Information File):**
- Standard crystallography format
- Contains: symmetry, cell, positions, sometimes properties
- May need conversion for simulation codes

**XYZ Format:**
- Simplest structure format
- Just element symbols and Cartesian coordinates
- No periodic cell information

**PDB (Protein Data Bank):**
- Standard for biomolecular structures
- Contains: coordinates, residue info, connectivity
- Often needs force field assignment

### Supporting File Formats

**PDF Documents:**
- Research papers with methodology
- May contain force field parameters
- Tables of computational settings

**Excel/CSV Spreadsheets:**
- Tabulated parameters
- Force field coefficients
- Experimental data for fitting

**Plain Text Files:**
- Force field libraries
- Parameter sets
- Configuration files

---

## Parameter Selection Guide

### Temperature

**Physical Meaning:** Average kinetic energy of atoms

**Units:** Always Kelvin (absolute temperature)

**Common Values:**
- Room temperature: 298-300 K
- Standard conditions: 298.15 K (25°C)
- Cryogenic: 77 K (liquid nitrogen), 4 K (liquid helium)
- High temperature studies: 500-1000 K
- Melting point studies: Near T_m for the material

**Cautions:**
- Never use Celsius in simulation input
- Consider phase transitions (melting, boiling)
- Some force fields only valid in certain temperature ranges

### Pressure

**Physical Meaning:** Force per unit area from atomic collisions

**Units:**
- Atmospheres (atm) - most common in real units
- Bar (≈ 1 atm)
- GPa for high-pressure studies

**Common Values:**
- Ambient: 1 atm = 1.01325 bar
- High pressure: 1-100 GPa
- Negative pressure: Can induce cavitation, use with caution

### Timestep

**Physical Meaning:** Time between integration steps

**Critical Constraint:** Must resolve the fastest motion in the system

**Rules:**
- Timestep should be ~1/10 of the fastest vibration period
- Hydrogen stretching: ~10 fs period → 1 fs timestep
- With SHAKE/RATTLE constraints: Can use 2 fs
- Heavy atoms only (metals): Can use 5-10 fs
- Always in femtoseconds for "real" units

**Consequences of Wrong Timestep:**
- Too large: Energy drift, instabilities, crashes
- Too small: Wasted computation, same physics

### Simulation Length

**Physical Meaning:** Total simulated time

**Depends On:**
- What property you're measuring
- How fast processes occur
- Computational resources

**Typical Ranges:**

| Purpose | Length | Steps at 1 fs |
|---------|--------|---------------|
| Energy minimization | N/A | 1,000-10,000 |
| Initial equilibration | 100 ps | 100,000 |
| NVT equilibration | 1 ns | 1,000,000 |
| NPT equilibration | 1-5 ns | 1-5 million |
| Diffusion calculation | 10+ ns | 10+ million |
| Protein folding | μs-ms | Impossible classically |

**For DFT:**
- SCF: Iterations, not time
- Relaxation: Steps until converged
- AIMD: 1-10 ps maximum

### Cutoffs

**Non-Bonded Cutoff (MD):**
- Distance beyond which interactions are ignored or switched
- Typical: 10-15 Å for LJ, infinite for Coulomb (use Ewald/PPPM)
- Must be < half of smallest box dimension

**K-space Accuracy:**
- PPPM accuracy: 1e-4 to 1e-6
- Higher accuracy = more expensive

**Wavefunction Cutoff (DFT):**
- Depends on pseudopotential
- Oxygen: ~60-80 Ry typically
- Carbon: ~40-60 Ry
- Hydrogen: ~40-50 Ry
- Heavy transition metals: ~80-100+ Ry

---

## Force Field Selection

### When to Use What

**OPLS-AA:**
- Organic molecules
- Drug-like compounds
- Polymers
- Good partial charges

**CHARMM/AMBER:**
- Proteins and nucleic acids
- Lipid membranes
- Carbohydrates
- Extensive validation for biomolecules

**UFF (Universal Force Field):**
- Quick estimates
- Exotic elements not in other force fields
- Less accurate than specialized force fields

**ReaxFF:**
- Chemical reactions
- Combustion
- Catalyst surfaces
- Very expensive, specialized parameters

**TraPPE:**
- Phase equilibria
- Vapor-liquid coexistence
- United-atom (CH3 as single site)

### Mixing Rules

When parameters for a type pair aren't explicitly given, mixing rules derive them:

**Lorentz-Berthelot (Most Common):**
- σ_ij = (σ_i + σ_j) / 2 (arithmetic mean)
- ε_ij = √(ε_i × ε_j) (geometric mean)

**Geometric Mixing:**
- σ_ij = √(σ_i × σ_j)
- ε_ij = √(ε_i × ε_j)

**Sixth-Power Mixing:**
- For certain specialized force fields

**Critical Understanding:** The mixing rule must match what the force field was parameterized with. OPLS uses geometric mixing. Using the wrong rule produces wrong results.

---

## Common Pitfalls

### For AI Agents Generating Input Files

**1. Inventing Force Field Parameters**
- NEVER generate ε/σ values from imagination
- If not in input files, report as missing
- Wrong parameters produce wrong physics - there is no "close enough"

**2. Unit Confusion**
- Energy: kcal/mol ≠ kJ/mol ≠ eV (conversion factors needed)
- Time: fs ≠ ps (factor of 1000)
- Pressure: atm ≈ bar, but GPa is 10,000 atm

**3. Incomplete Pair Coefficients**
- N atom types need N×(N+1)/2 pair specifications
- Or must use mixing rules explicitly
- Missing pairs cause crashes or wrong energies

**4. Cutoff vs Box Size**
- Cutoff must be < L/2 for all dimensions
- Otherwise atoms interact with own periodic image
- Check: box dimensions vs pair_style cutoff

**5. Wrong Atom Style**
- atom_style in script must match data file format
- "full" includes charges and molecule IDs
- "atomic" is just position and type
- Mismatch causes read errors or wrong interpretation

**6. Forgetting Long-Range Electrostatics**
- Truncating Coulomb at 12 Å is WRONG
- Must use kspace_style (pppm, ewald)
- Exception: Uncharged systems

**7. Pseudopotential Mismatch**
- All pseudopotentials must use same functional
- PBE calculation with LDA pseudopotential = wrong
- Check filenames carefully

**8. Insufficient K-Point Sampling**
- Metals need dense k-point grids
- Too few k-points = wrong electronic structure
- Convergence testing required

### For Campaign Planning

**1. Structure Without Force Field**
- A .data file might have coordinates but no Pair Coeffs
- Campaign Planner must identify this gap
- Cannot proceed without force field information

**2. Incompatible Settings**
- Barostat with fixed volume ensemble
- Thermostat with NVE
- Contradictory boundary conditions

**3. Unrealistic Timescales**
- 1 ns equilibration at 1 fs timestep = 1 million steps
- 1 μs = 1 billion steps (very expensive)
- DFT MD for nanoseconds = impossible

**4. Missing Output Commands**
- Simulation runs but produces no useful data
- Must specify dumps, computes, fixes for output

---

## Glossary

### General Terms

| Term | Definition |
|------|------------|
| Atom type | Numerical category for atoms with identical interaction parameters |
| Ensemble | Statistical mechanics framework specifying which quantities are controlled |
| Force field | Complete set of mathematical functions and parameters describing atomic interactions |
| Periodic boundary | System boundary where atoms exiting one side re-enter the opposite side |
| Timestep | Time increment between successive integration steps in MD |
| Trajectory | Record of atomic positions (and optionally velocities) over time |

### LAMMPS-Specific Terms

| Term | Definition |
|------|------------|
| atom_style | Specifies what properties each atom has (charge, molecule ID, etc.) |
| pair_style | Type of non-bonded potential (lj/cut, lj/cut/coul/long, etc.) |
| pair_coeff | Specific parameters for interactions between atom type pairs |
| fix | Operation applied to atoms at each timestep (integration, constraints) |
| compute | Calculation performed on the system (energy, temperature, etc.) |
| dump | Output of atomic data to file (trajectory, custom properties) |
| thermo | Thermodynamic output printed to screen/log |
| kspace_style | Method for long-range electrostatics (pppm, ewald) |
| minimize | Energy minimization algorithm |

### Quantum ESPRESSO Terms

| Term | Definition |
|------|------------|
| ecutwfc | Wavefunction kinetic energy cutoff in Rydberg |
| ecutrho | Charge density kinetic energy cutoff in Rydberg |
| pseudopotential | File containing effective potential replacing core electrons |
| SCF | Self-consistent field - iterative solution of electronic structure |
| nscf | Non-self-consistent field - using fixed charge density |
| ibrav | Bravais lattice type number |
| K_POINTS | Specification of Brillouin zone sampling |
| conv_thr | Electronic convergence threshold |
| mixing_beta | Charge density mixing parameter for SCF |

### Physical Properties

| Term | Definition |
|------|------------|
| MSD | Mean square displacement - measures diffusion |
| RDF | Radial distribution function - measures local structure |
| DOS | Density of states - electronic energy level distribution |
| Band gap | Energy difference between valence and conduction bands |
| Bulk modulus | Resistance to uniform compression |

---

## Example Scenario: CO2 Diffusion in MOF

This example illustrates what Campaign Builder must understand and do.

### User Intent
"Simulate CO2 diffusion in MOF-5 at 300K"

### What Campaign Builder Must Understand

**From the Intent:**
- Target property: Diffusion coefficient
- System: CO2 molecules in MOF-5 (Metal-Organic Framework)
- Condition: 300 K (room temperature)
- Simulation type: MD production run with MSD tracking

**From the Structure File (hypothetical mof5_co2.data):**
- Atom types present and their identities (Zn, O, C, H for MOF; C, O for CO2)
- Masses for each type
- Force field parameters (pair coefficients, bond coefficients if any)
- Box dimensions (must be large enough for diffusion)
- Which atoms are framework vs guest molecules

### What Campaign Builder Must Generate

**Initialization:**
- Correct units (real for organic/molecular systems)
- Atom style matching the data file
- Periodic boundaries (p p p for bulk diffusion)

**Force Field Specification:**
- pair_style matching the coefficients in the data file
- kspace_style if charges present
- Mixing rule consistent with the force field

**Grouping:**
- Separate groups for MOF framework and CO2 molecules
- This enables selective thermostatting or freezing

**Ensemble Choice:**
- NVT for diffusion (constant volume preserves density)
- Temperature: 300 K as specified
- Thermostat: Nosé-Hoover with appropriate damping

**Diffusion Measurement:**
- MSD compute on the CO2 group
- Time averaging fix to output MSD vs time
- Long enough run for statistical significance (nanoseconds)

**Output:**
- Trajectory dump for visualization (optional)
- MSD output file
- Thermo output for monitoring

**Validation Required:**
- All force field parameters from input file (never invented)
- Cutoffs appropriate for box size
- Timestep appropriate for system (1 fs for organic)
- Run length sufficient for diffusion (~5-10 ns minimum)

### What Campaign Builder Must NOT Do

- Invent Lennard-Jones parameters for any atom type
- Guess charges if not in the data file
- Assume bond connectivity if not specified
- Use inappropriate ensemble (NPT would change density)
- Use too short simulation time

---

## Summary for Campaign Builder Development

### Essential Rules

1. **Force field parameters are sacred** - Extract exactly from input files, never generate
2. **Units must be consistent** - Identify unit system first, interpret all values accordingly
3. **Validate everything** - Every generated deck must pass L0-L3 validation
4. **Fail loudly** - Missing information must be reported, not assumed

### What FileAnalyzer Must Extract

| File Type | Must Extract | Must Skip |
|-----------|--------------|-----------|
| LAMMPS .data | Header counts, box, Masses, all Coeffs sections | Atoms coordinates, Bonds/Angles lists |
| LAMMPS .in | All commands and settings | Comments (preserve for context) |
| QE .pwi | All namelists, ATOMIC_SPECIES, K_POINTS | Coordinates (note count) |
| POSCAR | Lattice vectors, species, counts | Coordinates (note count) |
| PDF | Parameters mentioned, methodology | General prose |
| Excel | Column headers, data tables | Formatting |

### What Campaign Planner Must Verify

- [ ] All atom types have masses
- [ ] All required pair coefficients are present (or mixing rules specified)
- [ ] Units are explicitly set and consistent
- [ ] Ensemble is appropriate for the desired calculation
- [ ] Timestep is appropriate for the system
- [ ] Box dimensions are compatible with cutoffs
- [ ] Output commands produce the needed data
- [ ] Run length is appropriate for the phenomenon

### Red Flags That Block Generation

- Missing Pair Coeffs section in data file
- No force field information anywhere in inputs
- Inconsistent unit systems across files
- Pseudopotential files not specified for DFT
- Cutoff larger than half box dimension

---

This background document provides the domain knowledge needed for Campaign Builder to generate scientifically valid simulation input files. The system must never guess physics - only extract and apply information from user-provided files.

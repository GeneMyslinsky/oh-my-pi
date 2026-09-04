import '_helpers.justfile'

# List this module's recipes.
_default:
    @just --list --justfile {{ quote(module_file()) }} --unsorted

# Build and atomically deploy the compiled omp binary into Herdr.
herdr *args:
    bun scripts/deploy-herdr.ts "$@"

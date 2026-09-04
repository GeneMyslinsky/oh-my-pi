import '_helpers.justfile'

mod deploy 'deploy.just'

# List every public recipe and submodule.
default:
    @just --list --unsorted --list-submodules

# Build every workspace.
build:
    bun run build

set shell := ["bash", "-euo", "pipefail", "-c"]
set script-interpreter := ["bash", "-euo", "pipefail"]
set positional-arguments
set export

CI := if env("CI", "") == "true" { "true" } else { "" }

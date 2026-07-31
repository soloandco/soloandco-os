# Security policy

## Supported versions

The project is experimental. Security fixes are provided for the latest released minor version only.

## Reporting a vulnerability

Do not open a public issue for vulnerabilities, leaked credentials, path traversal, destructive file operations, or privacy exposures. Use GitHub's private vulnerability reporting / Security Advisory feature for this repository.

Include:

- affected version and operating system
- exact command or profile that triggered the problem
- the smallest safe reproduction
- potential impact
- whether any real data was exposed

Never attach real credentials or unredacted customer data. We will acknowledge valid reports through GitHub and coordinate disclosure after a fix is available.

## Scope priorities

- writing outside the selected target directory
- overwriting existing user files
- leaking interview or generated workspace data
- secrets committed to examples or packages
- unsafe template or migration execution


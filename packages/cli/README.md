# verba CLI

Command-line interface for [Verba](https://github.com/nubisco/verba): the open-source i18n collaboration platform.

## Install

### npm / npx (all platforms)

```bash
# Run without installing
npx @nubisco/verba-cli setup

# Or install globally
npm install -g @nubisco/verba-cli
verba --help
```

### Homebrew (macOS / Linux)

```bash
brew tap nubisco/tap
brew install verba
```

## Commands

| Command         | Description                                                                  |
| --------------- | ---------------------------------------------------------------------------- |
| `verba setup`   | Interactive first-run wizard: configures DB, creates admin, generates `.env` |
| `verba migrate` | Run database migrations (`prisma migrate deploy`)                            |

## Development

```bash
pnpm build        # compile TypeScript
pnpm tsx src/index.ts setup   # run without building
```

## License

MIT © [Nubisco](https://nubisco.io)

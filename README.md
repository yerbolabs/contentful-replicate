# `contentful-copy-entry`

Copy Contentful entries (and any linked entries/assets) from one environment to another

## Command

```
npx contentful-copy-entry
```

## Options

```
  -m, --management-token  Contentful Management API token    [string] [required]
  -s, --space             Space ID                           [string] [required]
  -e, --entry             One or more Entry ID(s)             [array] [required]
  -f, --from              Copy FROM this environment         [string] [required]
  -t, --to                Copy TO this environment           [string] [required]
  -v, --verbose           Verbose logging                              [boolean]
  -h, --help              Show help                                    [boolean]
```

You may also use the `CONTENTFUL_MANAGEMENT_TOKEN` and `CONTENTFUL_SPACE` environment variables to configure the `management-token` and `space` options, respectively

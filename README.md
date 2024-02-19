# `contentful-copy-entry`

Copy Contentful entries (and any linked entries/assets) from one environment to another

## Command

```
npm run start
```

## Options

```
  -a, --access-token      Contentful Management API token    [string] [required]
  -s, --space             Space ID                           [string] [required]
  -e, --entry             Entry ID                           [string] [required]
  -f, --from              Copy FROM this environment         [string] [required]
  -t, --to                Copy TO this environment           [string] [required]
  -h, --help              Show help                                    [boolean]
```

You may also use the `CONTENTFUL_MANAGEMENT_TOKEN` and `CONTENTFUL_SPACE` environment variables to configure the `management-token` and `space` options, respectively

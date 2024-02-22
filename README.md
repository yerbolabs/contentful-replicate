# Contentful Replicate

Deep contentful entry replication command-line utility.

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

You may also use the `CONTENTFUL_ACCESS_TOKEN`, `CONTENTFUL_SPACE_ID`, `CONTENTFUL_FROM_ENVIRONMENT` and `CONTENTFUL_TO_ENVIRONMENT` environment variables.

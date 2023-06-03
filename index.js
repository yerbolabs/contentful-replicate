#!/usr/bin/env node
const contentful = require("contentful-management");
const isEqual = require("lodash.isequal");
const yargs = require("yargs/yargs")
const { hideBin } = require("yargs/helpers");

/**
 * @typedef Options
 * @property {string} space
 * @property {string} managementToken
 * @property {string} from
 * @property {string} to
 * @property {string[]} entry
 * @property {boolean} verbose
 */

/** @type {Options} */
let options;

/** @type {contentful.ClientAPI} */
let client;

/** @type {contentful.Space} */
let space;

/** @type {contentful.Environment} */
let fromEnvironment;

/** @type {contentful.Environment} */
let toEnvironment;

/** @type {contentful.Collection<contentful.Locale, contentful.LocaleProps>} */
let locales;

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Error} error
 */
function errorHandler(error) {
    const message = error.message || "Unknown error";
    console.error(message);
    if (options.verbose) {
        console.log(error.stack);
    }
    process.exit(1);
}

/**
 * @param {contentful.Entry|contentful.Asset} entity 
 * @returns {boolean}
 */
function isPublished(entity) {
    return (
        !!entity.sys.publishedVersion &&
        entity.sys.version == entity.sys.publishedVersion + 1
    )
}

/**
 * @param {string} message
 * @param {number} depth
 * @returns {void}
 */
function log(message, depth = 0) {
    if (options.verbose) {
        const prefix = "--".repeat(depth);
        console.log(prefix + message);
    }
}

/**
 * @param {string} entryId 
 * @param {number} depth 
 */
async function copyEntry(entryId, depth = 0) {
    log(`Copying entry ${entryId}`, depth);
    const fromEntry = await fromEnvironment.getEntry(entryId);
    const fromEntryData = fromEntry.toPlainObject();
    const contentTypeId = fromEntry.sys.contentType.sys.id;

    /** @type contentful.Entry */
    let toEntry;

    for (const locale of locales.items) {
        for (const fieldId of Object.keys(fromEntry.fields)) {
            const field = fromEntry.fields[fieldId][locale.code];

            if (Array.isArray(field)) {
                for (const row of field) {
                    if (
                        row?.sys?.type === "Link" &&
                        row?.sys?.linkType === "Entry"
                    ) {
                        await copyEntry(row?.sys.id, depth + 1);
                    }

                    if (
                        row?.sys?.type === "Link" &&
                        row?.sys?.linkType === "Asset"
                    ) {
                        await copyAsset(row?.sys.id, depth + 1);
                    }
                }
            } else {
                if (
                    field?.sys?.type === "Link" &&
                    field?.sys?.linkType === "Entry"
                ) {
                    await copyEntry(field?.sys.id, depth + 1);
                }

                if (
                    field?.sys?.type === "Link" &&
                    field?.sys?.linkType === "Asset"
                ) {
                    await copyAsset(field?.sys.id, depth + 1);
                }
            }
        }

        try {
            toEntry = await toEnvironment.getEntry(entryId);

            const toEntryData = toEntry.toPlainObject();

            log(`Found existing entry ${entryId}`, depth);

            if (isEqual(toEntryData.fields, fromEntryData.fields)) {
                log(`Existing entry ${entryId} has not changed, skipping`, depth);
                return;
            }
            
            Object.assign(toEntry.fields, fromEntryData.fields);

            toEntry = await toEntry.update();
        } catch (e) {
            const message = e.message;

            let response = undefined;

            if (message) {
                try {
                    response = JSON.parse(message);
                } catch (f) {}
            }

            if (response && response.status === 404) {
                log(`Did not find existing entry ${entryId}`, depth);

                toEntry = await toEnvironment.createEntryWithId(
                    contentTypeId,
                    entryId,
                    {
                        fields: {
                            ...fromEntryData.fields,
                        },
                    }
                );
            } else {
                throw e;
            }
        }

        if (isPublished(fromEntry)) {
            await sleep(50);

            await toEntry.publish();
        }

        log(
            `Saved entry https://app.contentful.com/spaces/${space.sys.id}/environments/${toEnvironment.sys.id}/entries/${entryId}`,
            depth
        );
    }
}

/**
 * @param {string} assetId
 * @param {number} depth
 */
async function copyAsset(assetId, depth = 0) {
    log(`Copying asset ${assetId}`, depth);

    const fromAsset = await fromEnvironment.getAsset(assetId);
    const fromAssetData = fromAsset.toPlainObject();

    try {
        await toEnvironment.getAsset(assetId);

        log(`Found existing asset ${assetId}`, depth);
    } catch (e) {
        const message = e.message;
        let response = undefined;
        if (message) {
            try {
                response = JSON.parse(message);
            } catch (f) {}
        }
        if (response && response.status === 404) {
            log(`Did not find existing asset ${assetId}`, depth);

            /** @type {contentful.Asset["fields"]["file"]} */
            const file = {};

            for (const locale of locales.items) {
                const fromFile = fromAssetData.fields.file[locale.code];
                if (fromFile) {
                    file[locale.code] = {
                        fileName: fromFile.fileName,
                        contentType: fromFile.contentType,
                        upload: `https:${fromFile.url}`,
                    };
                }
            }

            let toAsset = await toEnvironment.createAssetWithId(assetId, {
                fields: {
                    ...fromAssetData.fields,
                    file,
                },
            });

            await sleep(50);

            toAsset = await toAsset.processForAllLocales();

            await sleep(50);

            toAsset = await toAsset.publish();
        } else {
            throw e;
        }
    }

    log (
        `Saved asset https://app.contentful.com/spaces/${space.sys.id}/environments/${toEnvironment.sys.id}/assets/${assetId}`,
        depth
    );
}

/**
 * @param {Options} args 
 */
async function main(args) {
    options = args
    client = contentful.createClient({
        accessToken: options.managementToken,
    });

    space = await client.getSpace(options.space);
    fromEnvironment = await space.getEnvironment(options.from);
    toEnvironment = await space.getEnvironment(options.to);
    locales = await fromEnvironment.getLocales();

    for (const entryId of options.entry) {
        await copyEntry(entryId);
    }
}

process.on("unhandledRejection", errorHandler);
process.on("uncaughtException", errorHandler);

yargs(hideBin(process.argv))
    .env("CONTENTFUL")
    .command(
        "$0",
        "Copy Contentful entries (and any linked entries/assets) from one environment to another",
        (yargs) => yargs,
        (args) => main(/** @type {Options} */ (/** @type {unknown} */ (args)))
    )
    .option("management-token", {
        alias: "m",
        type: "string",
        description: "Contentful Management API token",
        demandOption: true,
    })
    .option("space", {
        alias: "s",
        type: "string",
        description: "Space ID",
        demandOption: true,
    })
    .option("entry", {
        alias: "e",
        type: "array",
        description: "One or more Entry ID(s)",
        demandOption: true,
    })
    .option("from", {
        alias: "f",
        type: "string",
        description: "Copy FROM this environment",
        demandOption: true,
    })
    .option("to", {
        alias: "t",
        type: "string",
        description: "Copy TO this environment",
        demandOption: true,
    })
    .option("verbose", {
        alias: "v",
        type: "boolean",
        description: "Verbose logging"
    })
    .alias('h', 'help')
    .parse();

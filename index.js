#!/usr/bin/env node
const R = require("ramda");
const RA = require("ramda-adjunct");
const chalk = require("chalk");
const dedent = require("dedent");
const inquirer = require("inquirer");
const minimist = require("minimist");
const ora = require("ora");
const contentful = require("contentful-management");

/**
 * @typedef Options
 * @property {string} space
 * @property {string} accessToken
 * @property {string} from
 * @property {string} to
 * @property {string} entry
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
    spinner.stop();
    console.error(error);
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
 * @param {string} entryId 
 * @param {string[]} parents 
 */
async function copyEntry(entryId, parents=[]) {
    const lineage = [...parents, entryId];
    const breadcrumb = chalk.italic.gray(`(${R.join(' → ', lineage)})`);

    // spinner.prefixText = chalk.gray(`   (${R.join(' → ', lineage)})`) + '\n';
    spinner.start(dedent`
        ${breadcrumb}
        ${`\u00a0\u00a0Fetching entry...`}
    `);

    const fromEntry = await fromEnvironment.getEntry(entryId);
    const fromEntryData = fromEntry.toPlainObject();
    const contentTypeId = fromEntry.sys.contentType.sys.id;

    /** @type contentful.Entry */
    let toEntry;

    // console.log(fromEntry.fields);

    // for (const locale of locales.items) {
        for (const fieldId of Object.keys(fromEntry.fields)) {
            const field = fromEntry.fields[fieldId][locale.code];
            // const field = fromEntry.fields[fieldId];

            // @todo for each of this replace row?.sys.id with copied entry or asset id

            if (Array.isArray(field)) {
                for (const row of field) {
                    if (
                        row?.sys?.type === "Link" &&
                        row?.sys?.linkType === "Entry"
                    ) {
                        await copyEntry(row?.sys.id, lineage);
                    }

                    if (
                        row?.sys?.type === "Link" &&
                        row?.sys?.linkType === "Asset"
                    ) {
                        await copyAsset(row?.sys.id, lineage);
                    }
                }
            } else {
                if (
                    field?.sys?.type === "Link" &&
                    field?.sys?.linkType === "Entry"
                ) {
                    await copyEntry(field?.sys.id, lineage);
                }

                if (
                    field?.sys?.type === "Link" &&
                    field?.sys?.linkType === "Asset"
                ) {
                    await copyAsset(field?.sys.id, lineage);
                }
            }
        }

        // toEntry = await toEnvironment.getEntry(entryId);

        // const toEntryData = toEntry.toPlainObject();

        // spinner.start(`Creating entry from entry ${chalk.magenta(entryId)}`);
        spinner.start(dedent`
            ${breadcrumb}
            ${`\u00a0\u00a0Creating entry...`}
        `);

        // if (isEqual(toEntryData.fields, fromEntryData.fields)) {
        //     log(`Existing entry ${entryId} has not changed, skipping`, depth);
        //     return;
        // }

        // Object.assign(toEntry.fields, fromEntryData.fields);

        // toEntry = await toEntry.update();

        // toEntry = await toEnvironment.createEntryWithId(
        toEntry = await toEnvironment.createEntry(
            contentTypeId,
            {
                fields: {
                    ...fromEntryData.fields,
                },
            }
        );

        // spinner.start(`Created entry from entry ${chalk.magenta(entryId)} as entry ${chalk.magenta(toEntry.sys.id)}`);
        // spinner.succeed(`Created entry ${chalk.magenta(toEntry.sys.id)}`);
        spinner.succeed(dedent`
            ${breadcrumb}
            ${`\u00a0\u00a0Created entry ${chalk.magenta(toEntry.sys.id)}`}
        `);

        // if (isPublished(fromEntry)) {
        //     await sleep(50);

        //     await toEntry.publish();
        // }

        // log(
        //     `Saved entry https://app.contentful.com/spaces/${space.sys.id}/environments/${toEnvironment.sys.id}/entries/${entryId}`,
        //     depth
        // );

        return toEntry;
    // }
}

/**
 * @param {string} assetId
 * @param {string[]} parents
 */
async function copyAsset(assetId, parents=[]) {
    const lineage = [...parents, assetId];
    const breadcrumb = chalk.italic.gray(`(${R.join(' → ', lineage)})`);

    // spinner.start(`Fetching asset ${chalk.magenta(assetId)}`);
    spinner.start(dedent`
        ${breadcrumb}
        ${`\u00a0\u00a0Fetching asset...`}
    `);

    const fromAsset = await fromEnvironment.getAsset(assetId);
    const fromAssetData = fromAsset.toPlainObject();

    /** @type {contentful.Asset["fields"]["file"]} */
    const file = {};

    // for (const locale of locales.items) {
        const fromFile = fromAssetData.fields.file[locale.code];
        // const fromFile = fromAssetData.fields.file;
        if (fromFile) {
            file[locale.code] = {
            // file = {
                fileName: fromFile.fileName,
                contentType: fromFile.contentType,
                upload: `https:${fromFile.url}`,
            };
        }
    // }

    // spinner.start(`Creating asset from asset ${chalk.magenta(assetId)}`);
    spinner.start(dedent`
        ${breadcrumb}
        ${`\u00a0\u00a0Creating asset...`}
    `);

    let toAsset = await toEnvironment.createAsset({
        fields: {
            ...fromAssetData.fields,
            file,
        },
    });

    await sleep(50);

    toAsset = await toAsset.processForAllLocales();

    await sleep(50);

    // spinner.start(`Created asset from asset ${chalk.magenta(assetId)} as asset ${chalk.magenta(toAsset.sys.id)}`);
    spinner.succeed(dedent`
        ${breadcrumb}
        ${`\u00a0\u00a0Created asset ${chalk.magenta(toAsset.sys.id)}`}
    `);

    // toAsset = await toAsset.publish();

    // log (
    //     `Saved asset https://app.contentful.com/spaces/${space.sys.id}/environments/${toEnvironment.sys.id}/assets/${assetId}`,
    //     depth
    // );
}

const required = R.compose(
    R.ifElse(
        RA.isEmptyString,
        R.always(' '),
        R.T,
    ),
    R.when(RA.isString, R.trim),
);


async function main() {
    args = minimist(process.argv.slice(2), {
      string: ['access-token', 'space', 'from', 'to', 'entry'],
      boolean: ['verbose'],
      alias: {
        a: 'access-token',
        s: 'space',
        f: 'from',
        t: 'to',
        e: 'entry',
        v: 'verbose',
      },
      default: {
        verbose: false,
      },
    });

    // @todo pull environment variables

    // console.log(args);

    options = R.map(
        R.when(RA.isString, R.trim)
    )(
        await inquirer.prompt(
            [{
                name: 'accessToken',
                type: 'input',
                message: `Using which contentful ${chalk.green('access token')}?`,
                validate: required,
            }, {
                name: 'space',
                type: 'input',
                message: `What contentful ${chalk.green('space')}?`,
                validate: required,
            }, {
                name: 'from',
                type: 'input',
                message: `From which contentful ${chalk.green('environment')}?`,
                default: 'master',
                validate: required,
            }, {
                name: 'to',
                type: 'input',
                message: `To which contentful ${chalk.green('environment')}?`,
                default: 'master',
                validate: required,
            }, {
                name: 'entry',
                type: 'input',
                message: `Which contentful ${chalk.green('entry')}?`,
                validate: required,
            }],
            RA.renameKeys({
                'access-token': 'accessToken'
            })(args)
        )
    );

    // console.log(options);

    spinner = spinner.start(`Creating contentful client`);

    client = contentful.createClient({
        accessToken: options.accessToken,
    });

    space = await client.getSpace(options.space);
    fromEnvironment = await space.getEnvironment(options.from);
    toEnvironment = await space.getEnvironment(options.to);
    // locales = await fromEnvironment.getLocales();
    locale = { code: 'en-US' };

    // console.log(dedent`
    //     space   ${chalk.magenta(options.space)}
    //     entry   ${chalk.magenta(options.entry)}
    //     from    ${chalk.magenta(options.from)}
    //     to      ${chalk.magenta(options.to)}
    // `, '\n');

    // return Promise.all(
    //     options.entry.map(id => copyEntry(id))
    // )

    const { sys: { id: entryId } } = await copyEntry(options.entry);

    spinner.stopAndPersist({
        symbol: chalk.magenta('\n➥'),
        text: dedent`
            ${chalk.italic.gray(`(link)`)}
            ${`\u00a0\u00a0https://app.contentful.com/spaces/${space.sys.id}/environments/${toEnvironment.sys.id}/entries/${entryId}`}
        `
    });
}

process.on("unhandledRejection", errorHandler);
process.on("uncaughtException", errorHandler);

args = {};
options = {};
spinner = ora();

main();

// yargs(hideBin(process.argv))
//     .env("CONTENTFUL")
//     .command(
//         "$0",
//         "Copy Contentful entries (and any linked entries/assets) from one environment to another",
//         (yargs) => yargs,
//         (args) => main(/** @type {Options} */ (/** @type {unknown} */ (args)))
//     )
//     .option("management-token", {
//         alias: "m",
//         type: "string",
//         description: "Contentful Management API token",
//         demandOption: true,
//     })
//     .option("space", {
//         alias: "s",
//         type: "string",
//         description: "Space ID",
//         demandOption: true,
//     })
//     .option("entry", {
//         alias: "e",
//         type: "array",
//         description: "One or more Entry ID(s)",
//         demandOption: true,
//     })
//     .option("from", {
//         alias: "f",
//         type: "string",
//         description: "Copy FROM this environment",
//         demandOption: true,
//     })
//     .option("to", {
//         alias: "t",
//         type: "string",
//         description: "Copy TO this environment",
//         demandOption: true,
//     })
//     .option("verbose", {
//         alias: "v",
//         type: "boolean",
//         description: "Verbose logging"
//     })
//     .alias('h', 'help')
//     .parse();

#!/usr/bin/env node
const R = require("ramda");
const RA = require("ramda-adjunct");
const ora = require("ora");
const chalk = require("chalk");
const dedent = require("dedent");
const inquirer = require("inquirer");
const minimist = require("minimist");
const contentful = require("contentful-management");
const parseRegex = require("regex-parser");

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

    spinner.start(dedent`
        ${breadcrumb}
        ${`\u00a0\u00a0Fetching entry...`}
    `);

    const fromEntry = await fromEnvironment.getEntry(entryId);
    const fromEntryData = fromEntry.toPlainObject();
    const contentTypeId = fromEntry.sys.contentType.sys.id;

    /** @type contentful.Entry */
    let toEntry;

    for (const fieldId of Object.keys(fromEntryData.fields)) {
        const field = fromEntryData.fields[fieldId][locale.code];

        if (Array.isArray(field)) {
            for (const row of field) {
                if (
                    row?.sys?.type === "Link" &&
                    row?.sys?.linkType === "Entry"
                ) {
                    const { sys: { id } } = await copyEntry(row?.sys.id, lineage);
                    row.sys.id = id;
                }

                if (
                    row?.sys?.type === "Link" &&
                    row?.sys?.linkType === "Asset"
                ) {
                    const { sys: { id } } = await copyAsset(row?.sys.id, lineage);
                    row.sys.id = id;
                }
            }
        } else {
            if (
                field?.sys?.type === "Link" &&
                field?.sys?.linkType === "Entry"
            ) {
                const { sys: { id } } = await copyEntry(field?.sys.id, lineage);
                field.sys.id = id;
            }

            if (
                field?.sys?.type === "Link" &&
                field?.sys?.linkType === "Asset"
            ) {
                const { sys: { id } } = await copyAsset(field?.sys.id, lineage);
                field.sys.id = id;
            }
        }
    }

    spinner.start(dedent`
        ${breadcrumb}
        ${`\u00a0\u00a0Creating entry...`}
    `);

    console.log(options);

    if (options.confirmReplace || options.confirmOtherReplace) {
        for (const fieldId of Object.keys(fromEntryData.fields)) {
            for (const localeCode of Object.keys(fromEntryData.fields[fieldId])) {
                const fieldData = fromEntryData.fields[fieldId][localeCode];

                if (
                    options.confirmReplace &&
                    options.replacementFields.includes(fieldId) &&
                    typeof fieldData === 'string'
                ) {
                    fromEntryData.fields[fieldId][localeCode] = R.replace(options.replacementExpression, options.replacementText)(fieldData);
                    console.log(fieldId, typeof fieldData, fieldData, fromEntryData.fields[fieldId][localeCode]);
                }

                if (
                    options.confirmOtherReplace &&
                    options.otherReplacementFields.includes(fieldId) &&
                    typeof fieldData === 'string'
                ) {
                    fromEntryData.fields[fieldId][localeCode] = R.replace(options.otherReplacementExpression, options.otherReplacementText)(fieldData);
                    console.log(fieldId, typeof fieldData, fieldData, fromEntryData.fields[fieldId][localeCode]);
                }
            }
        }
    }

    toEntry = await toEnvironment.createEntry(
        contentTypeId,
        {
            fields: {
                ...fromEntryData.fields,
            },
        }
    );

    spinner.succeed(dedent`
        ${breadcrumb}
        ${`\u00a0\u00a0Created entry ${chalk.magenta(toEntry.sys.id)}`}
    `);

    return toEntry;
}

/**
 * @param {string} assetId
 * @param {string[]} parents
 */
async function copyAsset(assetId, parents=[]) {
    const lineage = [...parents, assetId];
    const breadcrumb = chalk.italic.gray(`(${R.join(' → ', lineage)})`);

    spinner.start(dedent`
        ${breadcrumb}
        ${`\u00a0\u00a0Fetching asset...`}
    `);

    const fromAsset = await fromEnvironment.getAsset(assetId);
    const fromAssetData = fromAsset.toPlainObject();

    /** @type {contentful.Asset["fields"]["file"]} */
    const file = {};

    const fromFile = fromAssetData.fields.file[locale.code];
    if (fromFile) {
        file[locale.code] = {
            fileName: fromFile.fileName,
            contentType: fromFile.contentType,
            upload: `https:${fromFile.url}`,
        };
    }

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

    spinner.succeed(dedent`
        ${breadcrumb}
        ${`\u00a0\u00a0Created asset ${chalk.magenta(toAsset.sys.id)}`}
    `);
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
      alias: {
        a: 'access-token',
        s: 'space',
        f: 'from',
        t: 'to',
        e: 'entry',
      },
    });

    // @todo pull environment variables

    options = R.compose(
        R.evolve({
            space: R.trim,
            from: R.trim,
            to: R.trim,
            entry: R.trim,
            accessToken: R.trim,
            replacementFields: R.split(/\s*,\s*/),
            replacementExpression: parseRegex,
            otherReplacementFields: R.split(/\s*,\s*/),
            otherReplacementExpression: parseRegex,
        }),
    )(
        await inquirer.prompt(
            [{
                name: 'space',
                type: 'input',
                message: `On what contentful ${chalk.green('space')}?`,
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
            }, {
                name: 'accessToken',
                type: 'input',
                message: `Using which contentful ${chalk.green('access token')}?`,
                validate: required,
            }, {
                name: 'confirmReplace',
                type: 'confirm',
                message: `Execute ${chalk.green('replace')}?`,
                default: false,
                validate: required,
            }, {
                name: 'replacementFields',
                type: 'input',
                message: `Which ${chalk.green('fields')}?`,
                when: ({ confirmReplace }) => confirmReplace === true,
                validate: required,
            }, {
                name: 'replacementExpression',
                type: 'input',
                message: `Matching what ${chalk.green('expression')}?`,
                when: ({ confirmReplace }) => confirmReplace === true,
                validate: required,
            }, {
                name: 'replacementText',
                type: 'input',
                message: `Using which ${chalk.green('text')}?`,
                when: ({ confirmReplace }) => confirmReplace === true,
                default: '',
            }, {
                name: 'confirmOtherReplace',
                type: 'confirm',
                message: `Execute other ${chalk.green('replace')}?`,
                default: false,
                when: ({ confirmReplace }) => confirmReplace === true,
                validate: required,
            }, {
                name: 'otherReplacementFields',
                type: 'input',
                message: `Which ${chalk.green('fields')}?`,
                when: ({ confirmOtherReplace }) => confirmOtherReplace === true,
                validate: required,
            }, {
                name: 'otherReplacementExpression',
                type: 'input',
                message: `Matching what ${chalk.green('expression')}?`,
                when: ({ confirmOtherReplace }) => confirmOtherReplace === true,
                validate: required,
            }, {
                name: 'otherReplacementText',
                type: 'input',
                message: `Using which ${chalk.green('text')}?`,
                when: ({ confirmOtherReplace }) => confirmOtherReplace === true,
                default: '',
            }],
            RA.renameKeys({
                'access-token': 'accessToken'
            })(args)
        )
    );

    spinner = spinner.start(`Creating contentful client`);

    client = contentful.createClient({
        accessToken: options.accessToken,
    });

    space = await client.getSpace(options.space);
    fromEnvironment = await space.getEnvironment(options.from);
    toEnvironment = await space.getEnvironment(options.to);
    locale = { code: 'en-US' };

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

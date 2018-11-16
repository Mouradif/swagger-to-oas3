const fs = require('fs');
const YAML = require('js-yaml');
const SwaggerParser = require('swagger-parser');
const { die } = require('./src/utils');

process.argv.shift();
process.argv.shift();
const DocumentationDir = process.argv.shift();
if (DocumentationDir == null) {
    die(`\n\tUsage: $ node bundle <documentation-directory>\n`);
}
async function run(doc) {
    const modelFiles = fs.readdirSync(`./${DocumentationDir}/Models`).filter((item) => {
        return /\.yaml$/.test(item);
    });
    const entrypointFiles = fs.readdirSync(`./${DocumentationDir}/Entrypoints`).filter((item) => {
        return /\.yaml$/.test(item);
    });
    const configFiles = fs.readdirSync(`./${DocumentationDir}/Config`).filter((item) => {
        return /\.yaml$/.test(item);
    });
    for (let i = 0, len = modelFiles.length; i < len; i++) {
        let model = YAML.safeLoad(fs.readFileSync(`./${DocumentationDir}/Models/${modelFiles[i]}`));
        let modelName = Object.keys(model.components.schemas)[0];
        doc.components.schemas[modelName] = model.components.schemas[modelName];
    }
    for (let i = 0, len = entrypointFiles.length; i < len; i++) {
        let entrypoint = YAML.safeLoad(fs.readFileSync(`./${DocumentationDir}/Entrypoints/${entrypointFiles[i]}`));
        let entrypointPath = Object.keys(entrypoint.paths)[0];
        doc.paths[entrypointPath] = entrypoint.paths[entrypointPath];
    }
    for (let i = 0, len = configFiles.length; i < len; i++) {
        let config = YAML.safeLoad(fs.readFileSync(`./${DocumentationDir}/Config/${configFiles[i]}`));
        let configParam = Object.keys(config.components.parameters)[0];
        doc.components.parameters[configParam] = config.components.parameters[configParam];
    }
    try {
        let api = await SwaggerParser.validate(doc);
        fs.writeFileSync("documentation.yaml", YAML.safeDump(doc), "utf8");
        console.log("Valid !");
    } catch (e) {
        console.log(e.message);
    }
}
run({
    openapi: "3.0.0",
    info: {
        contact: {
            email: "team-api@wynd.eu",
            name: "Team API"
        },
        description: "WyndAPI is REST based....",
        license: {
            name: "MIT",
            url: "http://current-url-gives-404/"
        },
        title: "Wynd API",
        version: "1.21.0"
    },
    components: {
        schemas: {},
        parameters: {}
    },
    paths: {}
});

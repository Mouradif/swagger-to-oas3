#!/usr/bin/env node

const fs = require('fs');
const YAML = require('js-yaml');
const { die } = require('./src/utils');
const httpVerbs = [
    'get',
    'post',
    'put',
    'delete'
];

const intKeys = [
    'maxLength',
    'minLength'
];
process.argv.shift();
process.argv.shift();
const fileToParse = process.argv.shift();
if (fileToParse == null) {
	die(`\n\tUsage : $ node index <your-swagger-file> [<destination-directory>]\n`, 0);
}
if (!fs.existsSync(fileToParse)) {
	die(`Fatal: File ${fileToParse} doesn't exist\n`);
}
let DocumentationDir = process.argv.shift();
if (DocumentationDir == null) {
    DocumentationDir = "Doc";
}
if (fs.existsSync(DocumentationDir)) {
    die(`Fatal: Destination directory '${DocumentationDir}' already exists\n`);
}
fs.mkdirSync(DocumentationDir);
console.log(`Created destination directory ${DocumentationDir}`);
const swaggerText = fs.readFileSync(fileToParse);
let swaggerObject;
try {
	swaggerObject = JSON.parse(swaggerText);
} catch (e) {
	die(`Fatal: Could not parse file ${fileToParse} as a JSON object\n`);
}

let Definitions = [];
let Parameters = [];
let Paths = [];

for (let i in swaggerObject.definitions) {
    const name = i.toLowerCase().replace(/\s+/g, '_');
    const ref = '#/components/schemas/' + name;
    const originalRef = '#/definitions/' + i;
    Definitions.push({
        originalName: i,
        name,
        originalRef,
        ref
    });
}

for (let i in swaggerObject.parameters) {
    const ref = '#/components/parameters/' + i;
    const originalRef = '#/parameters/' + i;
    Parameters.push({
        originalName: i,
        name: i,
        originalRef,
        ref
    });
}

for (let i in swaggerObject.paths) {
    const ref = '#/paths/' + i;
    const originalRef = ref;
    Paths.push({
        originalName: i,
        name: i,
        originalRef,
        ref
    });
}

function getElementByOriginalRef(arr, ref) {
    for (let i = 0, len = arr.length; i < len; i++) {
        if (arr[i].originalRef == ref)
            return {
                name: arr[i].name,
                ref: arr[i].ref
            };
    }
    return null;
}

function fixReferences(data) {
    for (let i in data) {
        if (i == "produces")
            delete data[i];
        else if (i == "$ref") {
            let match = null;
            let originalReference = data[i];
            if (/^#\/parameters/.test(originalReference))
                match = getElementByOriginalRef(Parameters, originalReference);
            if (/^#\/paths/.test(originalReference))
                match = getElementByOriginalRef(Paths, originalReference);
            if (/^#\/definitions/.test(originalReference))
                match = getElementByOriginalRef(Definitions, originalReference);
            if (null === match)
                throw `Reference to an unknown resource ${originalReference}`;
            data[i] = match.ref;
        }
        else if (typeof data[i] == "object")
            data[i] = fixReferences(data[i]);
    }
    return data;
}

function fixBodySchema(parameters) {
    return parameters;
}

function fixRoutes(data, name) {
    for (let k = 0, klen = httpVerbs.length; k < klen; k++) {
        const verb = httpVerbs[k];
        if (null == data[verb])
            continue;
        if (null != data[verb].consumes)
            delete data[verb].consumes;
        if (null != data[verb].parameters && Array.isArray(data[verb].parameters)) {
            for (let i = 0; i < data[verb].parameters.length; i++) {
                if (data[verb].parameters[i].name == null)
                    continue;
                if (data[verb].parameters[i].name == "Body") {
                    data[verb].parameters[i].schema = fixNullables(data[verb].parameters[i].schema, [["Route", name].join('-')]);
                }
            }
            for (let i = 0, len = data[verb].parameters.length; i < len; i++) {
                if (data[verb].parameters[i].hasOwnProperty("type")) {
                    const type = data[verb].parameters[i].type;
                    data[verb].parameters[i].schema = {type};
                    delete data[verb].parameters[i].type;
                }
                if (data[verb].parameters[i].hasOwnProperty("default")) {
                    delete data[verb].parameters[i].default;
                }
            }
        }
        if (null != data[verb].responses) {
            for (let r in data[verb].responses) {
                if (null == data[verb].responses[r].schema && null == data[verb].responses[r].examples)
                    continue;
                data[verb].responses[r].content = {};
                let contentType = "application/json";
                if (data[verb].responses[r].examples != null) {
                    for (let e in data[verb].responses[r].examples) {
                        data[verb].responses[r].content[e] = {
                            example: data[verb].responses[r].examples[e]
                        };
                        if (data[verb].responses[r].schema != null) {
                            data[verb].responses[r].schema = fixNullables(data[verb].responses[r].schema, [["Route", name, verb, r, "Schema"].join('-')]);
                            data[verb].responses[r].content[e].schema = data[verb].responses[r].schema;
                        }
                    }
                } else {
                    data[verb].responses[r].schema = fixNullables(data[verb].responses[r].schema, [["Route", name, verb, r, "Schema"].join('-')]);
                    data[verb].responses[r].content[contentType] = {
                        schema: data[verb].responses[r].schema
                    };
                }
                if (null != data[verb].responses[r].schema)
                    delete data[verb].responses[r].schema;
                if (null != data[verb].responses[r].examples)
                    delete data[verb].responses[r].examples;
            }
        }
    }
    return data;
}

function fixNullables(data, trace = []) {
    if (data.type == "array") {
        if (data.items == null) {
            console.log(trace);
            throw `Got an array with no items`;
        }
        const itemKeys = Object.keys(data.items);
        if (itemKeys.indexOf("$ref") !== -1)
            return data;
        let newTrace = JSON.parse(JSON.stringify(trace));
        newTrace.push("items");
        data.items = fixNullables(data.items, newTrace);
        return data;
    }
    for (let i in data.properties) {
        if (data.properties[i].type == null)
            continue;
        if (typeof(data.properties[i].type) === "string") {
            if (data.properties[i].type == "array") {
                if (data.properties[i].items == null) {
                    console.log(trace);
                    throw `Got an array with no items`;
                }
                const itemKeys = Object.keys(data.properties[i].items);
                if (itemKeys.indexOf("$ref") !== -1)
                    continue;
                const newTrace = JSON.parse(JSON.stringify(trace));
                newTrace.push("Property " + i);
                data.properties[i].items = fixNullables(data.properties[i].items, newTrace);
            }
            continue;
        }
        if (!Array.isArray(data.properties[i].type)) {
            console.log(trace);
            throw `key ${i} type was not a string and not array either`;
        }
        if (data.properties[i].type.length !== 2) {
            console.log(trace);
            throw `key ${i} has more than 2 types`;
        }
        const nullIndex = data.properties[i].type.indexOf('null');
        if (nullIndex === -1) {
            console.log(trace);
            throw `key ${i} has more than 1 non-null type`;
        }
        const typeIndex = (nullIndex) ? 0 : 1;
        data.properties[i].type = data.properties[i].type[typeIndex];
        data.properties[i].nullable = true;
    }
    return data;
}

function fixParameters(data) {
    if (data.hasOwnProperty("type") || data.hasOwnProperty("enum") || data.hasOwnProperty("items")) {
        data.schema = {};
        if (data.hasOwnProperty("type")) {
            data.schema.type = data.type;
            delete data.type;
        }
        if (data.hasOwnProperty("items")) {
            data.schema.items = data.items;
            delete data.items;
        }
        if (data.hasOwnProperty("enum")) {
            data.schema.enum = data.enum;
            delete data.enum;
        }
    }
    return data;
}

function fixTypes(data) {
    for (let i in data) {
        if (typeof(data[i]) == "object")
            fixTypes(data[i]);
        else if (intKeys.indexOf(i) !== -1)
            data[i] = parseInt(data[i]);
    }
    return data;
}

function getElementByOriginalName(arr, name) {
    for (let i = 0, len = arr.length; i < len; i++) {
        if (arr[i].originalName == name)
            return {
                name: arr[i].name,
                ref: arr[i].ref
            };
    }
    return null;
}

function saveFile(fileName, object) {
    try {
	    fs.writeFileSync(fileName, YAML.safeDump(object), 'utf8');
    } catch (e) {
        console.log(e.message);
        console.log(JSON.stringify(object, null, 2));
        process.exit(1);
    }
}

async function saveDefinition(name, data) {
	if (!fs.existsSync(`./${DocumentationDir}/Models/`)) {
		fs.mkdirSync(`./${DocumentationDir}/Models`);
		console.log(`Created dir ./${DocumentationDir}/Models`);
	}
    const element = getElementByOriginalName(Definitions, name);
    if (null === element)
        throw `Unknown definition ${name}`;
	const entityName = element.name;
	const fileName = `./${DocumentationDir}/Models/` + entityName + '.yaml';
	if (fs.existsSync(fileName)) {
		throw `File ${fileName} already exists`; 
	}
    data = fixReferences(data);
    data = fixTypes(data);
    data = fixNullables(data, ["Definition" + name]);
    let up_data = {};
    up_data[entityName] = data;
	const object = {
		components: {
			schemas: up_data
		}
	};
    saveFile(fileName, object);
    return {name: entityName, data};
}

async function saveEntrypoint(name, data) {
	if (!fs.existsSync(`./${DocumentationDir}/Entrypoints/`)) {
		fs.mkdirSync(`./${DocumentationDir}/Entrypoints`);
		console.log(`Created dir ./${DocumentationDir}/Entrypoints`);
	}
    const element = getElementByOriginalName(Paths, name);
    if (null === element)
        throw `Unknown path ${name}`;
	const snakeName = name.toLowerCase().replace(/\//g, '_').replace(/^_/, '');
	const fileName = `./${DocumentationDir}/Entrypoints/` + snakeName + '.yaml';
	if (fs.existsSync(fileName)) {
		throw `File ${fileName} already exists`; 
	}
    data = fixReferences(data);
    data = fixRoutes(data, name);
    data = fixTypes(data);
    let up_data = {};
    up_data[name] = data;
	let object = {
		paths: up_data
	};
	object.paths[name] = data;
    saveFile(fileName, object);
    return {name, data};
}

async function saveParameter(name, data) {
	if (!fs.existsSync(`./${DocumentationDir}/Config/`)) {
		fs.mkdirSync(`./${DocumentationDir}/Config`);
		console.log(`Created dir ./${DocumentationDir}/Config`);
	}
	const snakeName = name.toLowerCase().replace(/\//g, '_').replace(/^_/, '');
	const fileName = `./${DocumentationDir}/Config/` + snakeName + '.yaml';
	if (fs.existsSync(fileName)) {
		throw `File ${fileName} already exists`; 
	}
    data = fixReferences(data);
    data = fixParameters(data);
    let up_data = {};
    up_data[name] = data;
	let object = {
		components: {
            parameters: up_data
        }
	};
    saveFile(fileName, object);
    return {name, data};
}

let global_doc = {
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
};

let p = Promise.resolve();
for (let i in swaggerObject.definitions) {
	p = p.then(() => saveDefinition(i, swaggerObject.definitions[i]).then((obj) => {
        global_doc.components.schemas[obj.name] = obj.data;
    }));
}

for (let i in swaggerObject.paths) {
	p = p.then(() => saveEntrypoint(i, swaggerObject.paths[i]).then((obj) => {
        global_doc.paths[obj.name] = obj.data;
    }));
}

for (let i in swaggerObject.parameters) {
	p = p.then(() => saveParameter(i, swaggerObject.parameters[i]).then((obj) => {
        global_doc.components.parameters[obj.name] = obj.data;
    }));
}

p.then(() => {
    console.log("Finished");
}).catch((e) => {
	console.log(e);
    process.exit(1);
});

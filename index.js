#!/usr/bin/env node

const fs = require('fs');
const YAML = require('js-yaml');

function die(message, code = 1) {
	let fct = (code === 0) ? console.log : console.warn;
	fct(message);
	process.exit(code);
}
process.argv.shift();
process.argv.shift();
if (process.argv.length !== 1) {
	die(`\n\tUsage : $ node index <your-swagger-file>\n`, 0);
}
if (!fs.existsSync(process.argv[0])) {
	die(`Fatal: File ${process.argv[0]} doesn't exist\n`);
}
const swaggerText = fs.readFileSync(process.argv[0]);
let swaggerObject;
try {
	swaggerObject = JSON.parse(swaggerText);
} catch (e) {
	die(`Fatal: Could not parse file ${process.argv[0]} as a JSON object\n`);
}
async function saveDefinition(name, data) {
	if (!fs.existsSync('./Models/')) {
		fs.mkdirSync('./Models');
		console.log("Created dir ./Models");
	}
	const fileName = ('./Models/' + name.toLowerCase() + '.yaml').replace(/\s+/g, '_');
	if (fs.existsSync(fileName)) {
		throw `File ${fileName} already exists`; 
	}
	fs.writeFileSync(fileName, YAML.safeDump({
		components: {
			schemas: data
		}
	}), 'utf8');
}

async function saveEntrypoint(name, data) {
	if (!fs.existsSync('./Entrypoints/')) {
		fs.mkdirSync('./Entrypoints');
		console.log("Created dir ./Entrypoints");
	}
	const snakeName = name.toLowerCase().replace(/\//g, '_').replace(/^_/, '');
	const fileName = './Entrypoints/' + snakeName + '.yaml';
	if (fs.existsSync(fileName)) {
		throw `File ${fileName} already exists`; 
	}
	let object = {
		paths: {}
	};
	object.paths[name] = data;
	fs.writeFileSync(fileName, YAML.safeDump(object), 'utf8');
}

for (let i in swaggerObject.definitions) {
	saveDefinition(i, swaggerObject.definitions[i]).catch((e) => {
		console.warn(e.stack);
	});
}

for (let i in swaggerObject.paths) {
	saveEntrypoint(i, swaggerObject.paths[i]).catch((e) => {
		console.warn(e.stack);
	});
}

console.log("Finished");

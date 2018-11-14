let die = function(message, code = 1) {
	let fct = (code === 0) ? console.log : console.warn;
	fct(message);
	process.exit(code);
}

module.exports = {
    die
};

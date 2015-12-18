import readline from 'readline';
import _ from 'lodash';
import colors from 'colors';

const DELIMITER = '  ';

const FIELDS = ['id', 'active', 'type', 'project', 'host', 'count', 'flags'];
const FIELDS_CAPITALIZED = FIELDS.map(field => _.capitalize(field));

const out = process.stdout;

class App {
    constructor(connection) {
        this._connection = connection;

        this._rl = readline.createInterface({
            input: process.stdin,
            output: out
        });

        writeLine('MySQL `system.node` editor.');
        writeLine('  Usage: {list,add,rm,clear,write,help,quit}\n');

        this._load();
    }

    async _load() {
        this._lines = await this._query('SELECT * FROM `node`');

        this._sortLines();

        this._printState();
        this._prompt();
    }

    _prompt() {
        this._rl.question('> ', command => {
            this._handleCommand(command.trim());
        });
    }

    async _handleCommand(rawCommand) {
        if (rawCommand) {
            const command = rawCommand.match(/^([a-z]+)(?:|\s(.*))$/);
            var result = false;

            if (command) {
                switch (command[1]) {
                    case 'list':
                        result = true;
                        break;
                    case 'clear':
                        this._lines = [];
                        result = true;
                        break;
                    case 'add':
                        result = this._add(command);
                        break;
                    case 'rm':
                        result = this._rm(command);
                        break;
                    case 'write':
                        await this._write();
                        result = true;
                        break;
                    case 'help':
                        this._printHelp();
                        result = false;
                        break;
                    case 'quit':
                        this._close();
                        result = false;
                        break;
                    default:
                        writeLine('Unknown command.');
                        result = false;
                }
            }

            if (result) {
                writeLine();
                this._printState();
            }

            if (!this._closing) {
                this._prompt();
            }
        }
    }

    _add(command) {
        const args = command[2].split(/\s+/);
        const project = args[0];
        var type = args[1];
        const host = args[2];

        if (type === 'projects') {
            type = 'project';
        }

        if (type && type !== 'project' && type !== 'admin') {
            writeLine('Bad type.');
            return;
        }

        if (project) {
            if (!type || type === 'admin') {
                this._lines.push({
                    new: true,
                    id: this._getNextIndex(),
                    active: 'yes',
                    type: 'admin',
                    project,
                    host: host ? host : 'virt1',
                    count: 1,
                    flags: '--dev'
                });
            }

            if (!type || type === 'project') {
                this._lines.push({
                    new: true,
                    id: this._getNextIndex(),
                    active: 'yes',
                    type: 'projects',
                    project,
                    host: host ? host : 'virt2',
                    count: 1,
                    flags: '--dev'
                });
            }
        } else {
            writeLine('Where project?');
            return;
        }

        return true;
    }

    _getNextIndex() {
        return this._lines.reduce((memo, line) => {
            return Math.max(memo, line.id);
        }, 0) + 1;
    }

    _rm(command) {
        const args = command[2];

        if (args) {
            const prevLength = this._lines.length;

            args.split(/\s+/).forEach(arg => {
                const id = Number(arg);

                if (!isNaN(id)) {
                    const index = _.findIndex(this._lines, { id });

                    if (index !== -1) {
                        this._lines.splice(index, 1);
                    }

                } else {
                    this._lines = this._lines.filter(line => line.project !== arg);
                }
            });

            if (this._lines.length === prevLength) {
                writeLine(`Not matched lines for ${args}.`);
                return;
            }

        } else {
            writeLine('Need argument.');
            return;
        }

        return true;
    }

    _sortLines() {
        this._lines = this._lines
            .sort((line1, line2) => line1.type.localeCompare(line2.type))
            .sort((line1, line2) => line1.project.localeCompare(line2.project));

        this._lines.forEach((line, i) => {
            line.id = i + 1;
        });
    }

    async _write() {
        this._sortLines();

        try {
            await this._query('TRUNCATE `node`');

            for (let i = 0; i < this._lines.length; ++i) {
                const line = this._lines[i];
                delete line.new;

                await this._query('INSERT INTO `node` SET ?', line);
            }

            writeLine('Table successfully updated.'.green);

        } catch(e) {
            writeLine(e.stack.red);

            process.exit(1);
        }
    }

    _printState() {
        const fieldsLengths = FIELDS.map(field => field.length);

        this._lines.forEach(line => {
            FIELDS.forEach((field, i) => {
                const val = line[field];

                if (val != null) {
                    fieldsLengths[i] = Math.max(fieldsLengths[i], val.toString().length);
                }
            });
        });

        FIELDS_CAPITALIZED.forEach((fieldTitle, i) => {
            write(n(fieldTitle, fieldsLengths[i]).bold + DELIMITER);
        });
        writeLine();

        if (this._lines.length) {
            this._lines.forEach(line => {
                FIELDS.forEach((fieldTitle, i) => {
                    var fieldValue = n(line[fieldTitle], fieldsLengths[i]);

                    if (line.new) {
                        fieldValue = fieldValue.green;
                    }

                    if (fieldTitle === 'project') {
                        fieldValue = fieldValue.bold;
                    }

                    write(fieldValue + DELIMITER);
                });

                writeLine();
            });

        } else {
            writeLine('  --- EMPTY ---');
        }
    }

    _close() {
        this._closing = true;
        this._rl.close();
        this._connection.end();
    }

    _query(...args) {
        return new Promise((resolve, reject) => {
            this._connection.query(...args, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            })
        });
    }

    _printHelp() {
        write(
            '  Commands:\n' +
            '    list -- print lines\n' +
            '    add %PROJECT [%TYPE [%HOST]] -- add lines\n' +
            '    rm %ID|%PROJECT -- remove lines by ID or by project name\n' +
            '    clear -- clear up all lines\n' +
            '    write -- write changes into database\n' +
            '    help -- print this help\n' +
            '    quit -- exit without saving\n'
        );
    }
}

function n(val, length) {
    if (val == null) {
        val = '';
    }

    val = val.toString();

    return val + _.repeat(' ', length - val.length);
}

function write(text) {
    out.write(text);
}

function writeLine(text) {
    out.write((text ? text : '') + '\n');
}

export default App;

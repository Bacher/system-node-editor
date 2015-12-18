import mysql from 'mysql';
import App from './app';

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise ', p, ' reason: ', reason);
    process.exit(1);
});

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'system'
});

connection.connect();

new App(connection);

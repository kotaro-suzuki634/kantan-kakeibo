require('dotenv').config();
const { initDatabase } = require('./db/init');
const app = require('./app');
const PORT = process.env.PORT || 3000;

initDatabase().then(()=>app.listen(PORT,()=>console.log(`かんたん家計簿: http://localhost:${PORT}`))).catch(error=>{console.error('起動できませんでした:',error.message);process.exit(1);});


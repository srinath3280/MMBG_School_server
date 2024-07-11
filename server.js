require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const app = express();

const secretKey = 'your_secret_key';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

const generateNewUserId = async () => {
    return new Promise((resolve, reject) => {
        db.query('SELECT MAX(user_id) AS max_user_id FROM web_user', (err, results) => {
            if (err) {
                reject(err);
            } else {
                const new_user_id = (results[0].max_user_id || 0) + 1;
                resolve(new_user_id);
            }
        });
    });
};

const generateNewUserId1 = async () => {
    return new Promise((resolve, reject) => {
        db.query('SELECT MAX(web_login_key) AS max_login_key FROM web_login_suc', (err, results) => {
            if (err) {
                reject(err);
            } else {
                const new_user_id1 = (results[0].max_login_key || 0) + 1;
                resolve(new_user_id1);
            }
        });
    });
};

const generateNewLoginFail = async () => {
    return new Promise((resolve, reject) => {
        db.query('SELECT MAX(web_login_fail_id) AS max_login_fail_key FROM web_login_fail', (err, results) => {
            if (err) {
                reject(err);
            } else {
                const new_user_id2 = (results[0].max_login_fail_key || 0) + 1;
                resolve(new_user_id2);
            }
        });
    });
};

const now = new Date();

// Function to format the date as YYYY-MM-DD
const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Function to format the time as HH:MM:SS
const formatTime = (date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};

// Combine the formatted date and time
var created_dt = `${formatDate(now)} ${formatTime(now)}`;

function queryDatabase(query) {
    return new Promise((resolve, reject) => {
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

app.post('/register', async (req, res) => {

    try {
        const { username, password } = req.body;

        // web_user_type Table
        const WebUserType = await queryDatabase(`SELECT * FROM web_user_type`);
        const web_user_type = WebUserType.filter((webUserType, index) => {
            if (webUserType.user_type === "student") {
                return true
            }
        })
        // console.log(web_user_type[0].web_user_type_id)

        // entity_business Table
        const EntityBusinessId = await queryDatabase(`SELECT * FROM entity_business`);
        const entity_business = EntityBusinessId.filter((EntityBusinessId, index) => {
            if (EntityBusinessId.entity_business_code === "EDU01") {
                return true
            }
        })
        // console.log(entity_business[0].entity_business_id)

        if (!username || !password) {
            return res.status(400).json({ error: 'Name and password are required' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const new_user_id = await generateNewUserId();
        const web_user_key_id = new_user_id;

        const user = {
            user_id: new_user_id,
            name: username,
            created_dt: created_dt,
            modified_dt: created_dt,
            password: hashedPassword,
            password_dt: created_dt,
            password_ch_dt: created_dt,
            web_user_key_id: web_user_key_id,
            status: 'A',
            web_user_type_id: web_user_type[0].web_user_type_id,
            user_type_code: web_user_type[0].user_type_code,
            created_user: 'self',
            system_user_id: 'system01',
            entity_business_id: entity_business[0].entity_business_id,
        };

        db.query('INSERT INTO web_user SET ?', user, (err, results) => {
            if (err) {
                return res.json({ error: 'Error inserting user into database', err });
            }

            res.json({ message: 'User created successfully', user_id: new_user_id });
        });
    } catch (error) {
        res.json({ error: 'Server error', error });
    }
});


app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await queryDatabase(`SELECT * FROM web_user WHERE name = "${username}"`);

        const resultDetails = result[0];
        const new_user_id1 = await generateNewUserId1();
        const new_user_id2 = await generateNewLoginFail();

        if (result.length === 0) {
            return res.json({ message: 'Invalid username or password' });
        }
        else {
            // const resultDetails = result[0];
            // const new_user_id1 = await generateNewUserId1();
            // const new_user_id2 = await generateNewLoginFail();

            const isMatch = await bcrypt.compare(password, resultDetails.password);

            if (isMatch) {
                const token = jwt.sign({ username: username }, secretKey, { expiresIn: '1h' });
                const user_login_success = {
                    web_login_key: new_user_id1,
                    login_time: created_dt,
                    logout_time: created_dt,
                    session_key: token,
                    user_id: resultDetails.user_id,
                    user_type_code: resultDetails.user_type_code,
                    user_name: resultDetails.name,
                    system_user_id: resultDetails.system_user_id,
                    status: resultDetails.status,
                };

                db.query('INSERT INTO web_login_suc SET ?', user_login_success, (err, results) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error inserting user into database', err });
                    }
                });
                return res.status(200).json({ token });
            } else {
                const user_login_fail = {
                    web_login_fail_id: new_user_id2,
                    user_id: resultDetails.user_id,
                    reason: "Wrong Password",
                    login_date: created_dt,
                    user_type_code: resultDetails.user_type_code,
                }

                db.query('INSERT INTO web_login_fail SET ?', user_login_fail, (err, results) => {
                    if (err) {
                        return res.status(500).json({ error: 'Error inserting user into database', err });
                    }
                });

                return res.json({ message: 'Invalid username or password' });
            }
        }
    }
    catch (error) {
        return res.status(500).json({ error: 'Server error' }, error)
    }
})



app.listen(process.env.PORT, () => { console.log("Server running on " + process.env.PORT) })
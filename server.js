const ModbusRTU = require('modbus-serial');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const mysql = require('mysql2/promise');
const ping = require('ping');
const app = express();
const bcrypt = require('bcrypt');
const os = require('os');
const MySQLStore = require('express-mysql-session')(session);

app.use(
  cors({
    origin: 'http://127.0.0.1:5501', // ✅ Ghi đúng origin của trình duyệt bạn chạy HTML
    credentials: true // ✅ Cho phép gửi cookie
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('static'));
app.use(express.static('templates')); // Thư mục chứa file HTML

let lastFetchTime = 0;
const FETCH_INTERVAL = 10000; // 10 giây
const MODBUS_PORT = 502;

// Xác định mật khẩu dựa trên hostname
const hostname = os.hostname();
let mysqlPassword;
if (hostname === 'LAPTOP-DABVF4H5') {
  // Thay bằng hostname của bạn
  mysqlPassword = '';
} else {
  mysqlPassword = 'tranvanvinh'; // Mặc định cho máy đồng đội
}

// Kết nối MySQL
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: mysqlPassword,
  database: 'modbus_database'
});

// Kết nối cho modbus_manager
const poolManager = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: mysqlPassword,
  database: 'modbus_manager'
});

// cấu hình MySQL session store
const sessionStore = new MySQLStore({
  clearExpired: true,
  checkExpirationInterval: 900000, // Kiểm tra hết hạn mỗi 15 phút
  createDatabaseTable: true, // Tự động tạo bảng sessions
  connectionLimit: 1,
  host: 'localhost',
  user: 'root',
  password: mysqlPassword, // hoặc mật khẩu nếu có
  database: 'modbus_manager'
});
app.use(
  session({
    secret: 'your-secret-key-here', // Thay bằng một chuỗi bí mật
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/',
      domain: '127.0.0.1'
    } // 1 ngày
  })
);

let requestQueue = []; // Hàng đợi FIFO
let isProcessing = false; // Trạng thái xử lý

// bcrypt.hash("123456", 10, (err, hash) => {
//     if (err) throw err;
//     pool.query('INSERT INTO users (email, password) VALUES (?, ?)', ["admin", hash], (err, result) => {
//       if (err) throw err;
//       console.log("Tạo tài khoản thành công");
//     });
// });

// Giá trị mặc định cho DeviceConfig
const defaultDeviceConfig = [
  { ip: '127.0.0.1', slave_id: 1, rated_current: 11.0 },
  { ip: '127.0.0.1', slave_id: 2, rated_current: 14.5 },
  { ip: '127.0.0.1', slave_id: 3, rated_current: 21.0 },
  { ip: '127.0.0.1', slave_id: 4, rated_current: 11.0 },
  { ip: '127.0.0.1', slave_id: 5, rated_current: 14.5 },
  { ip: '127.0.0.1', slave_id: 6, rated_current: 21.0 },
  { ip: '127.0.0.1', slave_id: 7, rated_current: 11.0 },
  { ip: '127.0.0.1', slave_id: 8, rated_current: 14.5 },
  { ip: '127.0.0.1', slave_id: 9, rated_current: 21.0 },
  { ip: '127.0.0.1', slave_id: 10, rated_current: 11.0 },
  { ip: '127.0.0.1', slave_id: 11, rated_current: 14.5 },
  { ip: '127.0.0.1', slave_id: 12, rated_current: 21.0 },
  { ip: '127.0.0.2', slave_id: 1, rated_current: 7.5 },
  { ip: '127.0.0.2', slave_id: 2, rated_current: 28.0 },
  { ip: '127.0.0.2', slave_id: 3, rated_current: 34.0 },
  { ip: '127.0.0.2', slave_id: 4, rated_current: 11.0 },
  { ip: '127.0.0.2', slave_id: 5, rated_current: 14.5 },
  { ip: '127.0.0.2', slave_id: 6, rated_current: 21.0 },
  { ip: '127.0.0.2', slave_id: 7, rated_current: 11.0 },
  { ip: '127.0.0.2', slave_id: 8, rated_current: 14.5 },
  { ip: '127.0.0.2', slave_id: 9, rated_current: 21.0 },
  { ip: '127.0.0.2', slave_id: 10, rated_current: 11.0 },
  { ip: '127.0.0.2', slave_id: 11, rated_current: 14.5 },
  { ip: '127.0.0.2', slave_id: 12, rated_current: 21.0 },
  { ip: '127.0.0.3', slave_id: 1, rated_current: 11.0 },
  { ip: '127.0.0.3', slave_id: 2, rated_current: 14.5 },
  { ip: '127.0.0.3', slave_id: 3, rated_current: 7.5 },
  { ip: '127.0.0.3', slave_id: 4, rated_current: 11.0 },
  { ip: '127.0.0.3', slave_id: 5, rated_current: 14.5 },
  { ip: '127.0.0.3', slave_id: 6, rated_current: 21.0 },
  { ip: '127.0.0.3', slave_id: 7, rated_current: 11.0 },
  { ip: '127.0.0.3', slave_id: 8, rated_current: 14.5 },
  { ip: '127.0.0.3', slave_id: 9, rated_current: 21.0 },
  { ip: '127.0.0.3', slave_id: 10, rated_current: 11.0 },
  { ip: '127.0.0.3', slave_id: 11, rated_current: 14.5 },
  { ip: '127.0.0.3', slave_id: 12, rated_current: 21.0 },
  { ip: '127.0.0.4', slave_id: 1, rated_current: 28.0 },
  { ip: '127.0.0.4', slave_id: 2, rated_current: 21.0 },
  { ip: '127.0.0.4', slave_id: 3, rated_current: 41.0 },
  { ip: '127.0.0.4', slave_id: 4, rated_current: 11.0 },
  { ip: '127.0.0.4', slave_id: 5, rated_current: 14.5 },
  { ip: '127.0.0.4', slave_id: 6, rated_current: 21.0 },
  { ip: '127.0.0.4', slave_id: 7, rated_current: 11.0 },
  { ip: '127.0.0.4', slave_id: 8, rated_current: 14.5 },
  { ip: '127.0.0.4', slave_id: 9, rated_current: 21.0 },
  { ip: '127.0.0.4', slave_id: 10, rated_current: 11.0 },
  { ip: '127.0.0.4', slave_id: 11, rated_current: 14.5 },
  { ip: '127.0.0.4', slave_id: 12, rated_current: 21.0 }
];

clearSessionsTable();
// Xóa bảng sessions khi server khởi động
async function clearSessionsTable() {
  try {
    await poolManager.query('DELETE FROM sessions');
  } catch (error) {
    console.error('Lỗi khi xóa bảng sessions:', error);
  }
}

function isAdmin(req, res, next) {
  console.log('Session hiện tại:', req.session); // Thêm dòng này để kiểm tra
  if (req.session.user && req.session.user.role === 'admin') {
    next(); // Cho phép tiếp tục nếu là admin
  } else {
    res.status(403).json({
      status: 'error',
      message: 'Bạn không phải Admin, bạn không có quyền truy cập chức năng này.'
    });
  }
}

function isLogin(req, res, next) {
  console.log('Session hiện tại:', req.session); // Thêm dòng này để kiểm tra
  if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'user')) {
    next(); // Cho phép tiếp tục nếu là admin
  } else {
    res.status(403).json({
      status: 'error',
      message: 'Bạn cần đăng nhập để dùng tính năng này.'
    });
  }
}

// Hàm tạo bảng nếu chưa tồn tại (sử dụng trong API)
async function createWorkScheduleTable() {
  const createTable = `
      CREATE TABLE IF NOT EXISTS work_schedule (
          id INT AUTO_INCREMENT PRIMARY KEY,
          day INT NOT NULL CHECK (day BETWEEN 2 AND 8),
          shift VARCHAR(10) NOT NULL,
          start_time TIME,
          end_time TIME,
          INDEX idx_day_shift (day, shift)
      );
  `;
  await poolManager.execute(createTable);

  // Kiểm tra xem bảng có dữ liệu không
  const [rows] = await poolManager.execute('SELECT COUNT(*) as count FROM work_schedule');
  const count = rows[0].count;

  // Nếu bảng rỗng, chèn dữ liệu ban đầu (21 bản ghi: 3 ca x 7 ngày)
  if (count === 0) {
    const shifts = ['Ca 1', 'Ca 2', 'Ca 3'];
    const days = [2, 3, 4, 5, 6, 7, 8]; // Thứ 2 đến Chủ nhật
    const insertData = [];

    for (const day of days) {
      for (const shift of shifts) {
        insertData.push([day, shift, null, null]);
      }
    }

    await poolManager.query(
      'INSERT INTO work_schedule (day, shift, start_time, end_time) VALUES ?',
      [insertData]
    );
  }
}

// Tạo bảng abnormal_alerts để lưu cảnh báo
async function createAbnormalAlertsTable() {
  try {
    const createTable = `
      CREATE TABLE IF NOT EXISTS abnormal_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip VARCHAR(50) NOT NULL,
        slave_id INT NOT NULL,
        error_time DATETIME NOT NULL,
        resolved_time DATETIME,
        UNIQUE KEY unique_alert (ip, slave_id, error_time)
      );
    `;
    await poolManager.execute(createTable);
    console.log('Bảng abnormal_alerts đã được tạo hoặc đã tồn tại.');
  } catch (error) {
    console.error('Lỗi khi tạo bảng abnormal_alerts:', error.message);
    throw error;
  }
}

// Hàm tạo bảng và chèn dữ liệu ban đầu nếu cần
async function createAbnormalCurrentTable() {
  try {
    // Tạo bảng nếu chưa tồn tại
    const createTable = `
          CREATE TABLE IF NOT EXISTS abnormal_current (
              id INT AUTO_INCREMENT PRIMARY KEY,
              gateway VARCHAR(50) NOT NULL,
              slaveid INT NOT NULL,
              current FLOAT NOT NULL DEFAULT 1.1
          );
      `;
    await poolManager.execute(createTable);

    // Kiểm tra xem bảng có dữ liệu không
    const [rows] = await poolManager.execute('SELECT COUNT(*) as count FROM abnormal_current');
    const count = rows[0].count;

    // Nếu bảng rỗng, chèn dữ liệu ban đầu (48 bản ghi: 4 Gateway x 12 SlaveID)
    if (count === 0) {
      const gateways = ['127.0.0.1', '127.0.0.2', '127.0.0.3', '127.0.0.4'];
      const slaveIds = Array.from({ length: 12 }, (_, i) => i + 1);
      const insertData = [];

      // for (const gateway of gateways) {
      //   for (const slaveid of slaveIds) {
      //     insertData.push([gateway, slaveid, 1.1]);
      //   }
      // }

      await poolManager.query('INSERT INTO abnormal_current (gateway, slaveid, current) VALUES ?', [
        insertData
      ]);
    }
  } catch (error) {
    console.error('Lỗi khi tạo bảng abnormal_current hoặc chèn dữ liệu:', error.message);
    throw error;
  }
}

// Tạo schema modbus_manager và bảng EditHistory
async function initializeEditHistoryTable() {
  try {
    // Tạo schema modbus_manager
    await poolManager.query('CREATE DATABASE IF NOT EXISTS modbus_manager');

    // Tạo bảng EditHistory trong schema modbus_manager
    await poolManager.query(`
            CREATE TABLE IF NOT EXISTS EditHistory (
                id INT AUTO_INCREMENT PRIMARY KEY,
                edit_time DATETIME NOT NULL,
                variable VARCHAR(100) NOT NULL,
                initial_value FLOAT NOT NULL,
                edited_value FLOAT NOT NULL,
                editor VARCHAR(255) NOT NULL
            )
        `);
    console.log('Đã tạo schema modbus_manager và bảng EditHistory');
  } catch (error) {
    console.error('Lỗi khi tạo schema modbus_manager hoặc bảng EditHistory:', error);
    throw error;
  }
}

// Hàm kiểm tra giờ làm việc dựa trên work_schedule
async function isWorkingHours() {
  const now = new Date(); // Thời gian hiện tại: 05:59 PM +07, Thứ Hai, 19/05/2025
  const dayOfWeek = now.getDay() === 0 ? 8 : now.getDay() + 1; // 0 (CN) -> 8, 1 (T2) -> 2, ..., 6 (T7) -> 7
  const currentTime = now.toTimeString().split(' ')[0]; // Lấy giờ hiện tại: "17:59:00"

  // Lấy lịch làm việc từ bảng work_schedule
  const [schedules] = await poolManager.execute(
    'SELECT start_time, end_time FROM work_schedule WHERE day = ? AND start_time IS NOT NULL AND end_time IS NOT NULL',
    [dayOfWeek]
  );

  // Kiểm tra xem thời gian hiện tại có nằm trong ca làm việc nào không
  for (const schedule of schedules) {
    const startTime = schedule.start_time.toString(); // "01:02:00"
    const endTime = schedule.end_time.toString(); // "01:03:00"
    if (currentTime >= startTime && currentTime <= endTime) {
      return true; // Đang trong giờ làm việc
    }
  }
  return false; // Ngoài giờ làm việc
}

// Hàm so sánh dòng trung bình và lưu cảnh báo
async function checkAbnormalCurrent(modbusData) {
  // Đảm bảo bảng abnormal_alerts đã được tạo
  await createAbnormalAlertsTable();

  let results = new Map(); // Sử dụng Map để tránh trùng ip-slaveId

  // Kiểm tra giờ làm việc
  const workingHours = await isWorkingHours();
  console.log(
    `Thời gian hiện tại: ${new Date().toISOString()} - Trong giờ làm việc: ${workingHours}`
  );

  // Nếu trong giờ làm việc, trả về status 0 cho tất cả
  if (workingHours) {
    for (const entry of modbusData) {
      const { ip, slaveId } = entry;
      results.set(`${ip}-${slaveId}`, { ip, slaveId, status: 0 });
    }
    console.log('Trong giờ làm việc, tất cả status = 0.');
    return Array.from(results.values());
  }

  // Ngoài giờ làm việc: Tính dòng trung bình và so sánh
  const [thresholds] = await poolManager.execute(
    'SELECT gateway, slaveid, current FROM abnormal_current'
  );
  const thresholdMap = new Map();
  thresholds.forEach((row) => {
    thresholdMap.set(`${row.gateway}-${row.slaveid}`, row.current);
  });

  // Lấy danh sách cảnh báo hiện tại để kiểm tra trạng thái trước đó
  const [existingAlerts] = await poolManager.execute(
    'SELECT id, ip, slave_id, resolved_time FROM abnormal_alerts WHERE resolved_time IS NULL'
  );
  const activeAlerts = new Map();
  existingAlerts.forEach((alert) => {
    activeAlerts.set(`${alert.ip}-${alert.slave_id}`, {
      id: alert.id,
      resolved_time: alert.resolved_time
    });
  });

  for (const entry of modbusData) {
    const { ip, slaveId, values, error } = entry;
    let status = 0;

    if (error) {
      results.set(`${ip}-${slaveId}`, { ip, slaveId, status });
      continue;
    }

    // Lấy dòng điện 3 pha (vị trí 7, 8, 9 trong values, tức chỉ số 6, 7, 8)
    const I_A = values[6] || 0;
    const I_B = values[7] || 0;
    const I_C = values[8] || 0;

    // Tính dòng trung bình
    const I_avg = (I_A + I_B + I_C) / 3;

    // Lấy ngưỡng từ bảng abnormal_current
    const threshold = thresholdMap.get(`${ip}-${slaveId}`) || 1.1; // Mặc định 1.1 nếu không tìm thấy

    // So sánh: status = 1 nếu vượt ngưỡng, 0 nếu không
    status = I_avg > threshold ? 1 : 0;
    results.set(`${ip}-${slaveId}`, { ip, slaveId, status });

    // Xử lý cảnh báo độc lập cho từng cặp ip-slaveId
    const alertKey = `${ip}-${slaveId}`;
    const existingAlert = activeAlerts.get(alertKey);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' '); // Định dạng DATETIME

    if (status === 1) {
      // Nếu status = 1 (vượt ngưỡng) và chưa có cảnh báo đang hoạt động, thêm mới
      if (!existingAlert) {
        await poolManager.execute(
          'INSERT INTO abnormal_alerts (ip, slave_id, error_time) VALUES (?, ?, ?)',
          [ip, slaveId, now]
        );
        console.log(`Đã lưu cảnh báo cho ${ip} - Slave ${slaveId} tại ${now}`);
        // Cập nhật activeAlerts để phản ánh bản ghi mới
        const [newAlert] = await poolManager.execute(
          'SELECT id FROM abnormal_alerts WHERE ip = ? AND slave_id = ? AND error_time = ?',
          [ip, slaveId, now]
        );
        activeAlerts.set(alertKey, { id: newAlert[0].id, resolved_time: null });
      }
    } else if (status === 0 && existingAlert) {
      // Nếu status = 0 (bình thường) và có cảnh báo đang hoạt động, cập nhật resolved_time
      await poolManager.execute(
        'UPDATE abnormal_alerts SET resolved_time = ? WHERE id = ? AND resolved_time IS NULL',
        [now, existingAlert.id]
      );
      console.log(`Đã cập nhật thời gian xử lý hoàn tất cho ${ip} - Slave ${slaveId} tại ${now}`);
      activeAlerts.delete(alertKey); // Xóa khỏi activeAlerts vì đã xử lý xong
    }
  }

  return Array.from(results.values());
}

// API để gọi hàm checkAbnormalCurrent
app.get('/check-abnormal', async (req, res) => {
  try {
    // Đảm bảo bảng abnormal_alerts đã được tạo trước khi gọi hàm
    await createAbnormalAlertsTable();
    const modbusData = await readModbusData(); // Hàm này bạn đã thiết lập
    const results = await checkAbnormalCurrent(modbusData);
    res.json(results);
  } catch (error) {
    console.error('Lỗi trong API /check-abnormal:', error.message);
    res.status(500).json({ error: 'Lỗi server khi kiểm tra dòng bất thường' });
  }
});

// Hàm đặt lại bảng DeviceConfig về giá trị mặc định
async function resetDeviceConfig() {
  try {
    // Xóa toàn bộ dữ liệu trong bảng
    await pool.query('DELETE FROM DeviceConfig');

    // Chèn lại giá trị mặc định
    for (const device of defaultDeviceConfig) {
      await pool.query('INSERT INTO DeviceConfig (ip, slave_id, rated_current) VALUES (?, ?, ?)', [
        device.ip,
        device.slave_id,
        device.rated_current
      ]);
    }
    console.log('Đã đặt lại bảng DeviceConfig về giá trị mặc định');
  } catch (error) {
    console.error('Lỗi khi đặt lại DeviceConfig:', error);
    throw error;
  }
}

// API đăng nhập
app.post('/login', async (req, res) => {
  console.log('Nhận được yêu cầu /login:', req.body);
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Vui lòng cung cấp email và mật khẩu' });
  }
  try {
    const [results] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (results.length === 0) {
      return res.status(401).json({ message: 'Email không tồn tại' });
    }
    const match = await bcrypt.compare(password, results[0].password);
    if (!match) {
      return res.status(401).json({ message: 'Mật khẩu không đúng' });
    }
    // Tạo session
    req.session.user = {
      email: results[0].email,
      role: results[0].role
    };
    req.session.save(); // Đảm bảo lưu session
    console.log('Session được tạo:', req.session.user);
    return res.status(200).json({ message: 'success', role: results[0].role });
  } catch (error) {
    console.error('Lỗi trong /login:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
});

// API kiểm tra trạng thái đăng nhập
app.get('/check-session', (req, res) => {
  if (req.session.user) {
    return res.status(200).json({
      loggedIn: true,
      role: req.session.user.role
    });
  } else {
    return res.status(200).json({
      loggedIn: false
    });
  }
});

//API check vai trò
app.get('/check-role', (req, res) => {
  console.log('Nhận được yêu cầu /check-role');
  console.log('Session hiện tại:', req.session);

  if (!req.session.user) {
    return res
      .status(401)
      .json({ role: null, message: 'Vui lòng đăng nhập để thực hiện hành động này' });
  }

  return res.status(200).json({ role: req.session.user.role });
});

// Lấy lịch làm việc
app.get('/get-work-schedule', async (req, res) => {
  try {
    // Tạo bảng nếu chưa tồn tại
    await createWorkScheduleTable();

    const [rows] = await poolManager.execute('SELECT * FROM work_schedule');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Lỗi server khi lấy lịch làm việc' });
  }
});

// Lấy tham số dòng điện bất thường
app.get('/get-abnormal-current', async (req, res) => {
  try {
    await createAbnormalCurrentTable();
    const [rows] = await poolManager.execute('SELECT * FROM abnormal_current');
    console.log(`Đã lấy dữ liệu: ${rows.length} bản ghi từ abnormal_current.`);
    res.json(rows);
  } catch (error) {
    console.error('Lỗi trong API /get-abnormal-current:', error.message);
    res.status(500).json({ error: 'Lỗi server khi lấy tham số dòng điện' });
  }
});

// Cập nhật tham số dòng điện bất thường
app.post('/update-abnormal-current', async (req, res) => {
  try {
    await createAbnormalCurrentTable();
    const data = req.body;

    for (const item of data) {
      const { id, gateway, slaveid, current } = item;
      if (id) {
        await poolManager.execute('UPDATE abnormal_current SET current = ? WHERE id = ?', [
          current,
          id
        ]);
      } else {
        await poolManager.execute(
          'INSERT INTO abnormal_current (gateway, slaveid, current) VALUES (?, ?, ?)',
          [gateway, slaveid, current]
        );
      }
    }
    console.log('Đã cập nhật tham số dòng điện thành công.');
    res.json({ message: 'Cập nhật tham số dòng điện thành công' });
  } catch (error) {
    console.error('Lỗi trong API /update-abnormal-current:', error.message);
    res.status(500).json({ error: 'Lỗi khi lưu tham số dòng điện' });
  }
});

// Cập nhật lịch làm việc
app.post('/update-work-schedule', async (req, res) => {
  try {
    // Tạo bảng nếu chưa tồn tại
    await createWorkScheduleTable();

    const schedule = req.body;
    for (const item of schedule) {
      const { id, day, shift, start_time, end_time } = item;
      if (id) {
        await poolManager.execute(
          'UPDATE work_schedule SET start_time = ?, end_time = ? WHERE id = ?',
          [start_time || null, end_time || null, id]
        );
      } else {
        await poolManager.execute(
          'INSERT INTO work_schedule (day, shift, start_time, end_time) VALUES (?, ?, ?, ?)',
          [day, shift, start_time || null, end_time || null]
        );
      }
    }
    res.json({ message: 'Cập nhật lịch làm việc thành công' });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi lưu lịch làm việc' });
  }
});

// API /is-logged-in (API mới thay cho /check-session)
app.get('/is-logged-in', (req, res) => {
  console.log('Kiểm tra đăng nhập:', req.session);
  if (req.session.user) {
    return res.status(200).json({
      loggedIn: true,
      role: req.session.user.role
    });
  } else {
    return res.status(200).json({
      loggedIn: false
    });
  }
});

// API tạo tài khoản mới
app.post('/create-account', async (req, res) => {
  console.log('Nhận được yêu cầu /create-account:', req.body);
  console.log('Session hiện tại:', req.session); // Log toàn bộ session
  if (!req.session.user) {
    console.log('Không có session.user');
    return res.status(401).json({ message: 'Vui lòng đăng nhập để thực hiện hành động này' });
  }
  if (req.session.user.role !== 'admin') {
    console.log('Role không phải admin:', req.session.user.role);
    return res.status(403).json({ message: 'Bạn không có quyền tạo tài khoản' });
  }
  const { adminPassword, newEmail, newPassword } = req.body;
  console.log('Dữ liệu nhận được:', { adminPassword, newEmail, newPassword });
  if (!adminPassword || !newEmail || !newPassword) {
    console.log('Thiếu thông tin');
    return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin' });
  }
  try {
    const [adminResults] = await pool.query('SELECT * FROM users WHERE email = ?', [
      req.session.user.email
    ]);
    console.log('Kết quả truy vấn admin:', adminResults);
    if (adminResults.length === 0) {
      console.log('Tài khoản admin không tồn tại');
      return res.status(401).json({ message: 'Tài khoản admin không tồn tại' });
    }
    const match = await bcrypt.compare(adminPassword, adminResults[0].password);
    console.log('Kết quả so sánh mật khẩu:', match);
    if (!match) {
      console.log('Mật khẩu admin không đúng');
      return res.status(401).json({ message: 'Mật khẩu admin không đúng' });
    }
    const [existingUser] = await pool.query('SELECT * FROM users WHERE email = ?', [newEmail]);
    console.log('Kiểm tra email tồn tại:', existingUser);
    if (existingUser.length > 0) {
      console.log('Email đã tồn tại');
      return res.status(409).json({ message: 'Email đã được sử dụng, vui lòng chọn email khác' });
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await pool.query("INSERT INTO users (email, password, role) VALUES (?, ?, 'user')", [
      newEmail,
      hashedPassword
    ]);
    console.log('Tạo tài khoản thành công:', newEmail);
    return res.status(200).json({ message: 'Tạo tài khoản thành công' });
  } catch (error) {
    console.error('Lỗi trong /create-account:', error);
    return res.status(500).json({ message: 'Lỗi server: ' + error.message });
  }
});

// API đăng xuất
app.post('/logout', (req, res) => {
  req.session.destroy();
  return res.status(200).json({ message: 'Đăng xuất thành công' });
});

app.get('/get-users', async (req, res) => {
  try {
    const [users] = await pool.query("SELECT email FROM users WHERE role = 'user'");
    res.status(200).json(users);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Lỗi server: ' + error.message
    });
  }
});

app.post('/delete-account', isAdmin, async (req, res) => {
  console.log('Nhận được yêu cầu /delete-account:', req.body);
  console.log('Session hiện tại:', req.session);

  const { emailToDelete, adminPassword } = req.body;

  // Kiểm tra thông tin đầu vào
  if (!emailToDelete || !adminPassword) {
    console.log('Thiếu thông tin');
    return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin' });
  }

  try {
    // Kiểm tra mật khẩu admin
    const [adminResults] = await pool.query('SELECT * FROM users WHERE email = ?', [
      req.session.user.email
    ]);
    console.log('Kết quả truy vấn admin:', adminResults);

    if (adminResults.length === 0) {
      console.log('Tài khoản admin không tồn tại');
      return res.status(401).json({ message: 'Tài khoản admin không tồn tại' });
    }

    const match = await bcrypt.compare(adminPassword, adminResults[0].password);
    console.log('Kết quả so sánh mật khẩu:', match);
    if (!match) {
      console.log('Mật khẩu admin không đúng');
      return res.status(401).json({ message: 'Mật khẩu admin không đúng' });
    }

    // Kiểm tra tài khoản cần xóa có tồn tại và là user không
    const [userToDelete] = await pool.query(
      "SELECT * FROM users WHERE email = ? AND role = 'user'",
      [emailToDelete]
    );
    console.log('Kết quả truy vấn user cần xóa:', userToDelete);

    if (userToDelete.length === 0) {
      console.log('Tài khoản cần xóa không tồn tại hoặc không phải user');
      return res
        .status(404)
        .json({ message: 'Tài khoản cần xóa không tồn tại hoặc không phải user' });
    }

    // Xóa tài khoản
    await pool.query('DELETE FROM users WHERE email = ?', [emailToDelete]);
    console.log('Đã xóa tài khoản:', emailToDelete);

    return res.status(200).json({ message: 'Xóa tài khoản thành công' });
  } catch (error) {
    console.error('Lỗi trong /delete-account:', error);
    return res.status(500).json({ message: 'Lỗi server: ' + error.message });
  }
});

app.post('/change-password', async (req, res) => {
  console.log('Nhận được yêu cầu /change-password:', req.body);
  console.log('Session hiện tại:', req.session);

  // Kiểm tra người dùng đã đăng nhập
  if (!req.session.user) {
    console.log('Không có session.user');
    return res.status(401).json({ message: 'Vui lòng đăng nhập để thực hiện hành động này' });
  }

  const { oldPassword, newPassword, confirmNewPassword } = req.body;
  console.log('Dữ liệu nhận được:', { oldPassword, newPassword, confirmNewPassword });

  // Kiểm tra thông tin đầu vào
  if (!oldPassword || !newPassword || !confirmNewPassword) {
    console.log('Thiếu thông tin');
    return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin' });
  }

  // Kiểm tra mật khẩu mới và nhập lại mật khẩu mới có khớp không
  if (newPassword !== confirmNewPassword) {
    console.log('Mật khẩu mới và nhập lại không khớp');
    return res.status(400).json({ message: 'Mật khẩu mới và nhập lại mật khẩu mới không khớp' });
  }

  try {
    // Lấy thông tin người dùng từ cơ sở dữ liệu
    const [userResults] = await pool.query('SELECT * FROM users WHERE email = ?', [
      req.session.user.email
    ]);
    console.log('Kết quả truy vấn user:', userResults);

    if (userResults.length === 0) {
      console.log('Tài khoản không tồn tại');
      return res.status(401).json({ message: 'Tài khoản không tồn tại' });
    }

    // So sánh mật khẩu cũ
    const match = await bcrypt.compare(oldPassword, userResults[0].password);
    console.log('Kết quả so sánh mật khẩu cũ:', match);
    if (!match) {
      console.log('Mật khẩu cũ không đúng');
      return res.status(401).json({ message: 'Mật khẩu cũ không đúng' });
    }

    // Mã hóa mật khẩu mới
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Cập nhật mật khẩu mới vào cơ sở dữ liệu
    await pool.query('UPDATE users SET password = ? WHERE email = ?', [
      hashedPassword,
      req.session.user.email
    ]);
    console.log('Đổi mật khẩu thành công cho:', req.session.user.email);

    return res.status(200).json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Lỗi trong /change-password:', error);
    return res.status(500).json({ message: 'Lỗi server: ' + error.message });
  }
});

app.get('/get-edit-history', async (req, res) => {
  try {
    const [rows] = await poolManager.query('SELECT * FROM EditHistory ORDER BY edit_time DESC');
    res.status(200).json(rows);
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu EditHistory:', error);
    res.status(500).json({
      status: 'error',
      message: 'Lỗi server: ' + error.message
    });
  }
});

// Route đặt lại DeviceConfig về giá trị mặc định
app.post('/reset-device-config', isAdmin, async (req, res) => {
  try {
    await resetDeviceConfig();
    res.status(200).json({
      status: 'success',
      message: 'Đặt lại thành công'
    });
  } catch (error) {
    console.error('Lỗi khi đặt lại DeviceConfig:', error);
    res.status(500).json({
      status: 'error',
      message: 'Lỗi server: ' + error.message
    });
  }
});

(async () => {
  try {
    initializeDeviceConfigTable;
    console.log('Giá trị ban đầu từ MySQL (warning-current-1):', currentSettingsLine1);
  } catch (error) {
    console.error('Không thể khởi tạo dữ liệu ban đầu từ MySQL, sử dụng giá trị mặc định');
  }
})();

let voltageSettingsPhase1 = {
  emergencyLevel: 200, // Mặc định từ bảng
  seriousLevel: 180,
  lightLevel: 160
};
(async () => {
  try {
    voltageSettingsPhase1 = await getVolPhaseSettingsFromDB();
  } catch (error) {
    console.error('Không thể lấy giá trị ban đầu từ MySQL, sử dụng giá trị mặc định');
    voltageSettingsPhase1 = { emergencyLevel: 160, seriousLevel: 180, lightLevel: 200 };
  }
})();

let voltageSettingsLine1 = {
  emergencyLevel: 320, // Mặc định từ bảng
  seriousLevel: 340,
  lightLevel: 360
};
(async () => {
  try {
    voltageSettingsLine1 = await getVolLineSettingsFromDB();
  } catch (error) {
    console.error('Không thể lấy giá trị ban đầu từ MySQL, sử dụng giá trị mặc định');
    voltageSettingsLine1 = { emergencyLevel: 320, seriousLevel: 340, lightLevel: 360 };
  }
})();

let currentSettings1 = {
  emergencyLevel: 1.5, // Mặc định từ bảng
  seriousLevel: 1.3,
  lightLevel: 1.1
};
(async () => {
  try {
    currentSettings1 = await getCurrentSettingsFromDB();
    console.log('Giá trị ban đầu từ MySQL:', currentSettingsLine1);
  } catch (error) {
    console.error('Không thể lấy giá trị ban đầu từ MySQL, sử dụng giá trị mặc định');
    currentSettings1 = { emergencyLevel: 1.5, seriousLevel: 1.3, lightLevel: 1.1 };
  }
})();

// Hàm lấy giá trị từ MySQL và tạo bảng nếu chưa tồn tại
async function getVolPhaseSettingsFromDB() {
  try {
    // Tạo bảng nếu chưa tồn tại
    await pool.query(`
            CREATE TABLE IF NOT EXISTS \`warning-vol-phase-1\` (
                \`level\` VARCHAR(20) PRIMARY KEY,
                \`value\` FLOAT NOT NULL
            )
        `);

    // Kiểm tra xem bảng có dữ liệu chưa
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM `warning-vol-phase-1`');
    const rowCount = rows[0].count;

    // Nếu bảng rỗng, chèn giá trị mặc định
    if (rowCount === 0) {
      await pool.query(`
                INSERT INTO \`warning-vol-phase-1\` (\`level\`, \`value\`) VALUES
                ('Emergency', 160),
                ('Serious', 180),
                ('Light', 200)
            `);
      console.log('Đã tạo bảng warning-vol-phase-1 và chèn giá trị mặc định');
    }

    // Lấy dữ liệu từ bảng
    const [data] = await pool.query('SELECT * FROM `warning-vol-phase-1`');
    const settings = {
      emergencyLevel: 0,
      seriousLevel: 0,
      lightLevel: 0
    };

    // Chuyển dữ liệu từ MySQL thành object
    data.forEach((row) => {
      if (row.level === 'Emergency') settings.emergencyLevel = row.value;
      if (row.level === 'Serious') settings.seriousLevel = row.value;
      if (row.level === 'Light') settings.lightLevel = row.value;
    });

    return settings;
  } catch (error) {
    console.error('Lỗi khi lấy giá trị từ MySQL:', error);
    throw error;
  }
}

async function updateVolPhasetSettingsInDB(settings) {
  try {
    const { emergencyLevel, seriousLevel, lightLevel } = settings;
    await pool.query(
      'INSERT INTO `warning-vol-phase-1` (`level`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      ['Emergency', emergencyLevel, emergencyLevel]
    );
    await pool.query(
      'INSERT INTO `warning-vol-phase-1` (`level`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      ['Serious', seriousLevel, seriousLevel]
    );
    await pool.query(
      'INSERT INTO `warning-vol-phase-1` (`level`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      ['Light', lightLevel, lightLevel]
    );
  } catch (error) {
    console.error('Lỗi khi cập nhật giá trị vào MySQL:', error);
    throw error;
  }
}

// Route nhận cài đặt từ form phase
app.post('/save-settings-vol-phase-1', isAdmin, async (req, res) => {
  const { emergencyLevel, seriousLevel, lightLevel } = req.body;

  // Kiểm tra giá trị có hợp lệ không
  if (isNaN(emergencyLevel) || isNaN(seriousLevel) || isNaN(lightLevel)) {
    return res.status(400).json({
      status: 'error',
      message: 'Giá trị nhập vào phải là số hợp lệ'
    });
  }

  // Kiểm tra thứ tự các mức
  if (emergencyLevel >= seriousLevel || seriousLevel >= lightLevel) {
    return res.status(400).json({
      status: 'error',
      message: 'Các mức phải theo thứ tự: Emergency < Serious < Light'
    });
  }

  // Lấy người sửa từ session
  const editor = req.session?.user?.email || 'unknown';

  // Lấy giá trị ban đầu từ bảng warning-voltage-phase-1
  const currentData = await pool.query('SELECT * FROM `warning-vol-phase-1`');
  const currentSettings = {
    emergencyLevel: 0,
    seriousLevel: 0,
    lightLevel: 0
  };
  currentData[0].forEach((row) => {
    if (row.level === 'Emergency') currentSettings.emergencyLevel = row.value;
    if (row.level === 'Serious') currentSettings.seriousLevel = row.value;
    if (row.level === 'Light') currentSettings.lightLevel = row.value;
  });

  // Chuẩn bị các bản ghi lịch sử cho những giá trị thay đổi
  const historyEntries = [];
  if (parseFloat(currentSettings.emergencyLevel) !== parseFloat(emergencyLevel)) {
    historyEntries.push({
      variable: 'vol_phase1_emergency_level',
      initial_value: currentSettings.emergencyLevel,
      edited_value: emergencyLevel
    });
  }
  if (parseFloat(currentSettings.seriousLevel) !== parseFloat(seriousLevel)) {
    historyEntries.push({
      variable: 'vol_phase1_serious_level',
      initial_value: currentSettings.seriousLevel,
      edited_value: seriousLevel
    });
  }
  if (parseFloat(currentSettings.lightLevel) !== parseFloat(lightLevel)) {
    historyEntries.push({
      variable: 'vol_phase1_light_level',
      initial_value: currentSettings.lightLevel,
      edited_value: lightLevel
    });
  }

  // Cập nhật cài đặt cho khu vực 1
  voltageSettingsPhase1 = { emergencyLevel, seriousLevel, lightLevel };
  updateVolPhasetSettingsInDB(voltageSettingsPhase1);

  // Lưu lịch sử chỉnh sửa vào modbus_manager.EditHistory
  for (const entry of historyEntries) {
    await poolManager.query(
      'INSERT INTO EditHistory (edit_time, variable, initial_value, edited_value, editor) VALUES (NOW(), ?, ?, ?, ?)',
      [entry.variable, entry.initial_value, entry.edited_value, editor]
    );
  }

  // In giá trị sau khi lưu để xác nhận
  console.log('Giá trị đã lưu P1:');
  console.log(voltageSettingsPhase1);

  res.json({
    status: 'success',
    settings: voltageSettingsPhase1
  });
});

app.get('/get-settings-vol-phase-1', (req, res) => {
  res.status(200).json(voltageSettingsPhase1);
});

// Hàm lấy giá trị từ MySQL và tạo bảng nếu chưa tồn tại
async function getVolLineSettingsFromDB() {
  try {
    // Tạo bảng nếu chưa tồn tại
    await pool.query(`
            CREATE TABLE IF NOT EXISTS \`warning-vol-line-1\` (
                \`level\` VARCHAR(20) PRIMARY KEY,
                \`value\` FLOAT NOT NULL
            )
        `);

    // Kiểm tra xem bảng có dữ liệu chưa
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM `warning-vol-line-1`');
    const rowCount = rows[0].count;

    // Nếu bảng rỗng, chèn giá trị mặc định
    if (rowCount === 0) {
      await pool.query(`
                INSERT INTO \`warning-vol-line-1\` (\`level\`, \`value\`) VALUES
                ('Emergency', 340),
                ('Serious', 360),
                ('Light', 380)
            `);
      console.log('Đã tạo bảng warning-vol-line-1 và chèn giá trị mặc định');
    }

    // Lấy dữ liệu từ bảng
    const [data] = await pool.query('SELECT * FROM `warning-vol-line-1`');
    const settings = {
      emergencyLevel: 0,
      seriousLevel: 0,
      lightLevel: 0
    };

    // Chuyển dữ liệu từ MySQL thành object
    data.forEach((row) => {
      if (row.level === 'Emergency') settings.emergencyLevel = row.value;
      if (row.level === 'Serious') settings.seriousLevel = row.value;
      if (row.level === 'Light') settings.lightLevel = row.value;
    });

    return settings;
  } catch (error) {
    console.error('Lỗi khi lấy giá trị từ MySQL:', error);
    throw error;
  }
}

async function updateVolLineSettingsInDB(settings) {
  try {
    const { emergencyLevel, seriousLevel, lightLevel } = settings;
    await pool.query(
      'INSERT INTO `warning-vol-line-1` (`level`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      ['Emergency', emergencyLevel, emergencyLevel]
    );
    await pool.query(
      'INSERT INTO `warning-vol-line-1` (`level`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      ['Serious', seriousLevel, seriousLevel]
    );
    await pool.query(
      'INSERT INTO `warning-vol-line-1` (`level`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      ['Light', lightLevel, lightLevel]
    );
  } catch (error) {
    console.error('Lỗi khi cập nhật giá trị vào MySQL:', error);
    throw error;
  }
}

app.post('/save-settings-vol-line-1', isAdmin, async (req, res) => {
  const { emergencyLevel, seriousLevel, lightLevel } = req.body;

  // Kiểm tra giá trị có hợp lệ không
  if (isNaN(emergencyLevel) || isNaN(seriousLevel) || isNaN(lightLevel)) {
    return res.status(400).json({
      status: 'error',
      message: 'Giá trị nhập vào phải là số hợp lệ'
    });
  }

  // Kiểm tra thứ tự các mức
  if (emergencyLevel >= seriousLevel || seriousLevel >= lightLevel) {
    return res.status(400).json({
      status: 'error',
      message: 'Các mức phải theo thứ tự: Emergency < Serious < Light'
    });
  }

  // Lấy người sửa từ session
  const editor = req.session?.user?.email || 'unknown';

  // Lấy giá trị ban đầu từ bảng warning-voltage-1
  const currentData = await pool.query('SELECT * FROM `warning-vol-line-1`');
  const currentSettings = {
    emergencyLevel: 0,
    seriousLevel: 0,
    lightLevel: 0
  };
  currentData[0].forEach((row) => {
    if (row.level === 'Emergency') currentSettings.emergencyLevel = row.value;
    if (row.level === 'Serious') currentSettings.seriousLevel = row.value;
    if (row.level === 'Light') currentSettings.lightLevel = row.value;
  });

  // Chuẩn bị các bản ghi lịch sử cho những giá trị thay đổi
  const historyEntries = [];
  if (parseFloat(currentSettings.emergencyLevel) !== parseFloat(emergencyLevel)) {
    historyEntries.push({
      variable: 'vol_line1_emergency_level',
      initial_value: currentSettings.emergencyLevel,
      edited_value: emergencyLevel
    });
  }
  if (parseFloat(currentSettings.seriousLevel) !== parseFloat(seriousLevel)) {
    historyEntries.push({
      variable: 'vol_line1_serious_level',
      initial_value: currentSettings.seriousLevel,
      edited_value: seriousLevel
    });
  }
  if (parseFloat(currentSettings.lightLevel) !== parseFloat(lightLevel)) {
    historyEntries.push({
      variable: 'vol_line1_light_level',
      initial_value: currentSettings.lightLevel,
      edited_value: lightLevel
    });
  }

  // Cập nhật cài đặt cho khu vực 1
  voltageSettingsLine1 = { emergencyLevel, seriousLevel, lightLevel };
  updateVolLineSettingsInDB(voltageSettingsLine1);

  // Lưu lịch sử chỉnh sửa vào modbus_manager.EditHistory
  for (const entry of historyEntries) {
    await poolManager.query(
      'INSERT INTO EditHistory (edit_time, variable, initial_value, edited_value, editor) VALUES (NOW(), ?, ?, ?, ?)',
      [entry.variable, entry.initial_value, entry.edited_value, editor]
    );
  }
  // In giá trị sau khi lưu để xác nhận
  console.log('Giá trị đã lưu l1:');
  console.log(voltageSettingsLine1);

  res.json({
    status: 'success',
    settings: voltageSettingsLine1
  });
});

app.get('/get-settings-vol-line-1', (req, res) => {
  res.status(200).json(voltageSettingsLine1);
});

// Hàm lấy giá trị từ MySQL và tạo bảng nếu chưa tồn tại
async function getCurrentSettingsFromDB() {
  try {
    // Tạo bảng nếu chưa tồn tại
    await pool.query(`
            CREATE TABLE IF NOT EXISTS \`warning-current-1\` (
                \`level\` VARCHAR(20) PRIMARY KEY,
                \`value\` FLOAT NOT NULL
            )
        `);

    // Kiểm tra xem bảng có dữ liệu chưa
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM `warning-current-1`');
    const rowCount = rows[0].count;

    // Nếu bảng rỗng, chèn giá trị mặc định
    if (rowCount === 0) {
      await pool.query(`
                INSERT INTO \`warning-current-1\` (\`level\`, \`value\`) VALUES
                ('Emergency', 4.5),
                ('Serious', 4.0),
                ('Light', 3.5)
            `);
      console.log('Đã tạo bảng warning-current-1 và chèn giá trị mặc định');
    }

    // Lấy dữ liệu từ bảng
    const [data] = await pool.query('SELECT * FROM `warning-current-1`');
    const settings = {
      emergencyLevel: 0,
      seriousLevel: 0,
      lightLevel: 0
    };

    // Chuyển dữ liệu từ MySQL thành object
    data.forEach((row) => {
      if (row.level === 'Emergency') settings.emergencyLevel = row.value;
      if (row.level === 'Serious') settings.seriousLevel = row.value;
      if (row.level === 'Light') settings.lightLevel = row.value;
    });

    return settings;
  } catch (error) {
    console.error('Lỗi khi lấy giá trị từ MySQL:', error);
    throw error;
  }
}

async function updateCurrentSettingsInDB(settings) {
  try {
    const { emergencyLevel, seriousLevel, lightLevel } = settings;
    await pool.query(
      'INSERT INTO `warning-current-1` (`level`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      ['Emergency', emergencyLevel, emergencyLevel]
    );
    await pool.query(
      'INSERT INTO `warning-current-1` (`level`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      ['Serious', seriousLevel, seriousLevel]
    );
    await pool.query(
      'INSERT INTO `warning-current-1` (`level`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
      ['Light', lightLevel, lightLevel]
    );
  } catch (error) {
    console.error('Lỗi khi cập nhật giá trị vào MySQL:', error);
    throw error;
  }
}

// Route nhận cài đặt từ form Current
app.post('/save-settings-current-1', isAdmin, async (req, res) => {
  const { emergencyLevel, seriousLevel, lightLevel } = req.body;

  // Kiểm tra giá trị có hợp lệ không
  if (isNaN(emergencyLevel) || isNaN(seriousLevel) || isNaN(lightLevel)) {
    return res.status(400).json({
      status: 'error',
      message: 'Giá trị nhập vào phải là số hợp lệ'
    });
  }

  // Kiểm tra thứ tự các mức
  if (emergencyLevel <= seriousLevel || seriousLevel <= lightLevel) {
    return res.status(400).json({
      status: 'error',
      message: 'Các mức phải theo thứ tự: Emergency < Serious < Light'
    });
  }

  // Lấy người sửa từ session
  const editor = req.session?.user?.email || 'unknown';

  // Lấy giá trị ban đầu từ bảng warning-current-1
  const [currentData] = await pool.query('SELECT * FROM `warning-current-1`');
  const currentSettings = {
    emergencyLevel: 0,
    seriousLevel: 0,
    lightLevel: 0
  };
  currentData.forEach((row) => {
    if (row.level === 'Emergency') currentSettings.emergencyLevel = row.value;
    if (row.level === 'Serious') currentSettings.seriousLevel = row.value;
    if (row.level === 'Light') currentSettings.lightLevel = row.value;
  });

  // Chuẩn bị các bản ghi lịch sử cho những giá trị thay đổi
  const historyEntries = [];
  if (parseFloat(currentSettings.emergencyLevel) !== parseFloat(emergencyLevel)) {
    historyEntries.push({
      variable: 'emergency_level',
      initial_value: currentSettings.emergencyLevel,
      edited_value: emergencyLevel
    });
  }
  if (parseFloat(currentSettings.seriousLevel) !== parseFloat(seriousLevel)) {
    historyEntries.push({
      variable: 'serious_level',
      initial_value: currentSettings.seriousLevel,
      edited_value: seriousLevel
    });
  }
  if (parseFloat(currentSettings.lightLevel) !== parseFloat(lightLevel)) {
    historyEntries.push({
      variable: 'light_level',
      initial_value: currentSettings.lightLevel,
      edited_value: lightLevel
    });
  }

  // Cập nhật cài đặt cho khu vực 1
  currentSettings1 = { emergencyLevel, seriousLevel, lightLevel };
  updateCurrentSettingsInDB(currentSettings1);

  // Lưu lịch sử chỉnh sửa vào modbus_manager.EditHistory
  for (const entry of historyEntries) {
    await poolManager.query(
      'INSERT INTO EditHistory (edit_time, variable, initial_value, edited_value, editor) VALUES (NOW(), ?, ?, ?, ?)',
      [entry.variable, entry.initial_value, entry.edited_value, editor]
    );
  }
  // In giá trị sau khi lưu để xác nhận
  console.log('Giá trị đã lưu C1:');
  console.log(currentSettings1);

  res.json({
    status: 'success',
    settings: currentSettings1
  });
});

app.get('/get-settings-current-1', (req, res) => {
  res.status(200).json(currentSettings1);
});

async function testDbConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Đã kết nối MySQL!');
    connection.release(); // Trả connection về pool
  } catch (err) {
    console.error('❌ Lỗi kết nối MySQL:', err);
  }
}

// Gọi kiểm tra kết nối
testDbConnection();

// Hàm chuyển đổi 2 thanh ghi thành số float 32-bit
const { bignumber, format } = require('mathjs');

function toFloat32(high, low) {
  if (high === undefined || low === undefined) {
    console.warn('⚠️ Dữ liệu không hợp lệ:', high, low);
    return NaN;
  }
  let buffer = Buffer.alloc(4);
  buffer.writeUInt16BE(high, 0);
  buffer.writeUInt16BE(low, 2);
  let floatValue = buffer.readFloatBE(0);
  return parseFloat(format(bignumber(floatValue), { precision: 6 })); // Giữ chính xác 6 chữ số
}

// Hàm tạo bảng DeviceConfig nếu chưa tồn tại
async function initializeDeviceConfigTable() {
  try {
    await pool.query(`
            CREATE TABLE IF NOT EXISTS DeviceConfig (
                ip VARCHAR(50),
                slave_id INT,
                rated_current FLOAT,
                PRIMARY KEY (ip, slave_id)
            )
        `);

    const [rows] = await pool.query('SELECT COUNT(*) as count FROM DeviceConfig');
    const rowCount = rows[0].count;

    if (rowCount === 0) {
      await pool.query(`
                INSERT INTO DeviceConfig (ip, slave_id, rated_current) VALUES
                ('127.0.0.1', 1, 11.0),
                ('127.0.0.1', 2, 14.5),
                ('127.0.0.1', 3, 21.0),
                ('127.0.0.1', 4, 11.0 ),
                ('127.0.0.1', 5, 14.5 ),
                ('127.0.0.1', 6, 21.0 ),
                ('127.0.0.1', 7, 11.0 ),
                ('127.0.0.1', 8, 14.5 ),
                ('127.0.0.1', 9, 21.0 ),
                ('127.0.0.1', 10, 11.0 ),
                ('127.0.0.1', 11, 14.5 ),
                ('127.0.0.1', 12, 21.0 ),
                ('127.0.0.2', 1, 7.5),
                ('127.0.0.2', 2, 28.0),
                ('127.0.0.2', 3, 34.0),
                ('127.0.0.2', 4, 11.0 ),
                ('127.0.0.2', 5, 14.5 ),
                ('127.0.0.2', 6, 21.0 ),
                ('127.0.0.2', 7, 11.0 ),
                ('127.0.0.2', 8, 14.5 ),
                ('127.0.0.2', 9, 21.0 ),
                ('127.0.0.2', 10, 11.0 ),
                ('127.0.0.2', 11, 14.5 ),
                ('127.0.0.2', 12, 21.0 ),
                ('127.0.0.3', 1, 11.0),
                ('127.0.0.3', 2, 14.5),
                ('127.0.0.3', 3, 7.5),
                ('127.0.0.3', 4, 11.0 ),
                ('127.0.0.3', 5, 14.5 ),
                ('127.0.0.3', 6, 21.0 ),
                ('127.0.0.3', 7, 11.0 ),
                ('127.0.0.3', 8, 14.5 ),
                ('127.0.0.3', 9, 21.0 ),
                ('127.0.0.3', 10, 11.0 ),
                ('127.0.0.3', 11, 14.5 ),
                ('127.0.0.3', 12, 21.0 ),
                ('127.0.0.4', 1, 28.0),
                ('127.0.0.4', 2, 21.0),
                ('127.0.0.4', 3, 41.0),
                ('127.0.0.4', 4, 11.0 ),
                ('127.0.0.4', 5, 14.5 ),
                ('127.0.0.4', 6, 21.0 ),
                ('127.0.0.4', 7, 11.0 ),
                ('127.0.0.4', 8, 14.5 ),
                ('127.0.0.4', 9, 21.0 ),
                ('127.0.0.4', 10, 11.0 ),
                ('127.0.0.4', 11, 14.5 ),
                ('127.0.0.4', 12, 21.0 )
            `);
      console.log('Đã tạo bảng DeviceConfig và chèn giá trị mặc định');
    }
  } catch (error) {
    console.error('Lỗi khi tạo bảng DeviceConfig:', error);
    throw error;
  }
}

// Route lấy dữ liệu DeviceConfig
app.get('/get-device-config', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM DeviceConfig');
    res.status(200).json(rows);
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu DeviceConfig:', error);
    res.status(500).json({
      status: 'error',
      message: 'Lỗi server: ' + error.message
    });
  }
});

// Route lưu dữ liệu DeviceConfig
app.post('/save-device-config', isAdmin, async (req, res) => {
  try {
    const devices = req.body;

    for (const device of devices) {
      const { ip, slave_id, rated_current } = device;
      if (!ip || isNaN(slave_id) || isNaN(rated_current)) {
        return res.status(400).json({
          status: 'error',
          message: 'Dữ liệu không hợp lệ: IP, Slave ID và Rated Current phải hợp lệ'
        });
      }
    }
    // Lấy người sửa từ session
    const editor = req.session?.user?.email || 'unknown';

    // Lấy giá trị ban đầu trước khi cập nhật và chỉ lưu lịch sử nếu có thay đổi
    const historyEntries = [];
    for (const device of devices) {
      const { ip, slave_id, rated_current } = device;
      const [rows] = await pool.query(
        'SELECT rated_current FROM DeviceConfig WHERE ip = ? AND slave_id = ?',
        [ip, slave_id]
      );
      if (rows.length > 0) {
        const initialValue = rows[0].rated_current;
        // Chỉ thêm vào historyEntries nếu giá trị thực sự thay đổi
        if (initialValue !== rated_current) {
          historyEntries.push({
            ip,
            slave_id,
            initial_value: initialValue,
            edited_value: rated_current
          });
        }
      }
    }

    await updateDeviceConfig(devices);
    // Lưu lịch sử chỉnh sửa (chỉ cho các giá trị đã thay đổi)
    for (const entry of historyEntries) {
      await poolManager.query(
        'INSERT INTO EditHistory (edit_time, variable, initial_value, edited_value, editor) VALUES (NOW(), ?, ?, ?, ?)',
        [
          `rated_current_${entry.ip}_${entry.slave_id}`,
          entry.initial_value,
          entry.edited_value,
          editor
        ]
      );
    }

    console.log('Đã cập nhật DeviceConfig:', devices);
    res.status(200).json({
      status: 'success',
      message: 'Cập nhật thành công'
    });
  } catch (error) {
    console.error('Lỗi khi lưu DeviceConfig:', error);
    res.status(500).json({
      status: 'error',
      message: 'Lỗi server: ' + error.message
    });
  }
});

// Hàm cập nhật rated_current trong DeviceConfig
async function updateDeviceConfig(devices) {
  try {
    for (const device of devices) {
      const { ip, slave_id, rated_current } = device;
      await pool.query(
        'INSERT INTO DeviceConfig (ip, slave_id, rated_current) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rated_current = ?',
        [ip, slave_id, rated_current, rated_current]
      );
    }
  } catch (error) {
    console.error('Lỗi khi cập nhật DeviceConfig:', error);
    throw error;
  }
}

// Danh sách thiết bị Modbus
const MODBUS_DEVICES = [
  { ip: '127.0.0.1', slaveIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { ip: '127.0.0.2', slaveIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { ip: '127.0.0.3', slaveIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { ip: '127.0.0.4', slaveIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }
  //{ ip: '127.0.0.5' }
];

// API Đọc dữ liệu từ Modbus
// Hàm đọc dữ liệu Modbus
async function readModbusData() {
  let results = [];

  await Promise.all(
    MODBUS_DEVICES.map(async (device) => {
      const client = new ModbusRTU();
      try {
        await client.connectTCP(device.ip, { port: MODBUS_PORT });
        console.log(`✅ Kết nối thành công: ${device.ip}`);

        for (let slaveId of device.slaveIds) {
          try {
            client.setID(slaveId);
            client.setTimeout(1000);
            //console.log(`📡 Đọc dữ liệu từ ${device.ip} - Slave ID ${slaveId}`);

            let rawData = await client.readHoldingRegisters(9, 66);
            //console.log(`🔹 Dữ liệu nhận được từ ${device.ip} - Slave ID ${slaveId}:`, rawData.data);

            let values = [];
            for (let i = 0; i < 66; i += 2) {
              let value = toFloat32(rawData.data[i], rawData.data[i + 1]);
              values.push(value);
            }

            await saveModbusData(device.ip, slaveId, values);
            results.push({ ip: device.ip, slaveId, values });
          } catch (err) {
            console.error(`❌ Lỗi đọc từ ${device.ip} (Slave ${slaveId}):`, err.message);
          }
        }
      } catch (err) {
        console.error(`❌ Không thể kết nối đến ${device.ip}:`, err.message);
      } finally {
        client.close();
      }
    })
  );

  //console.log("✅ Kết quả đọc Modbus:", results);
  return results;
}

// ✅ Hàm kiểm tra trạng thái Modbus
async function checkModbusStatus1() {
  let results = [];

  await Promise.all(
    MODBUS_DEVICES.map(async (device) => {
      const client = new ModbusRTU();
      try {
        await client.connectTCP(device.ip, { port: MODBUS_PORT });

        for (let slaveId of device.slaveIds) {
          try {
            client.setID(slaveId);
            client.setTimeout(1000);

            await client.readHoldingRegisters(0, 1);
            results.push({ ip: device.ip, slaveId, status: 1 });
          } catch {
            results.push({ ip: device.ip, slaveId, status: 0 });
          }
        }
      } catch {
        device.slaveIds.forEach((slaveId) => {
          results.push({ ip: device.ip, slaveId, status: 0 });
        });
      } finally {
        client.close();
      }
    })
  );

  return results;
}

// ✅ Xử lý hàng đợi
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return; // Nếu đang bận hoặc không có yêu cầu thì dừng

  isProcessing = true;
  let { req, res, handler } = requestQueue.shift(); // Lấy yêu cầu đầu tiên trong hàng đợi

  try {
    let results = await handler();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    isProcessing = false;
    processQueue(); // Tiếp tục xử lý yêu cầu tiếp theo
  }
}

// ✅ API đọc dữ liệu Modbus (đưa vào hàng đợi)
app.get('/read-modbus', (req, res) => {
  requestQueue.push({ req, res, handler: readModbusData });
  processQueue(); // Kích hoạt xử lý hàng đợi
});

// ✅ API kiểm tra trạng thái Modbus (đưa vào hàng đợi)
app.get('/status-modbus-device', (req, res) => {
  requestQueue.push({ req, res, handler: checkModbusStatus1 });
  processQueue(); // Kích hoạt xử lý hàng đợi
});

// 🔥 Tự động gọi API mỗi 10 giây
setInterval(async () => {
  console.log('🔄 Tự động đọc dữ liệu Modbus...');
  await readModbusData();
  const modbusData = await readModbusData(); // Đọc dữ liệu từ Modbus
  const results = await checkAbnormalCurrent(modbusData);
}, FETCH_INTERVAL);

// Lưu dữ liệu vào MySQL
async function saveModbusData(ip, slaveId, values) {
  const tableName = `modbus_data_${ip.replace(/\./g, '_')}_${slaveId}`;
  const deviceKey = `${ip}_${slaveId}`;

  // Tạo bảng nếu chưa có
  await pool.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            volts_ii FLOAT,
            volts_2 FLOAT,
            volts_3 FLOAT,
            volts_4 FLOAT,
            volts_5 FLOAT,
            volts_6 FLOAT,
            current1 FLOAT,
            current2 FLOAT,
            current3 FLOAT,
            power1 FLOAT,
            power2 FLOAT,
            power3 FLOAT,
            v2ave FLOAT,
            iave FLOAT,
            kWtotal FLOAT,
            kVArtotal FLOAT,
            kVAtotal FLOAT,
            frequency FLOAT,
            power_factor_total FLOAT,
            power_factor_1 FLOAT,
            power_factor_2 FLOAT,
            power_factor_3 FLOAT,
            kwh_import FLOAT,
            kwh_export FLOAT,
            kvarh FLOAT,
            kvah FLOAT,
            hdia FLOAT,
            hdib FLOAT,
            hdic FLOAT,
            hdvab FLOAT,
            hdvbc FLOAT,
            hdvca FLOAT,
            vinave FLOAT
        )
    `);

  await pool.query(`
        CREATE TABLE IF NOT EXISTS Alarm (
            id INT AUTO_INCREMENT PRIMARY KEY,
            location VARCHAR(255),
            start_time TIME,
            end_time TIME,
            event_date DATE,
            duration_seconds INT
        )
    `);

  await pool.query(`
        CREATE TABLE IF NOT EXISTS DeviceConfig (
            ip VARCHAR(50),
            slave_id INT,
            rated_current FLOAT,
            PRIMARY KEY (ip, slave_id)
        )
        `);

  // Xây dựng câu lệnh INSERT
  let placeholders = values.map(() => '?').join(', ');
  let sql = `
        INSERT INTO ${tableName} (
            volts_ii, volts_2, volts_3, volts_4, volts_5, volts_6, 
            current1, current2, current3, power1, power2, power3, 
            v2ave, iave, kWtotal, kVArtotal, kVAtotal, frequency, 
            power_factor_total, power_factor_1, power_factor_2, power_factor_3, 
            kwh_import, kwh_export, kvarh, kvah, hdia, hdib, hdic, 
            hdvab, hdvbc, hdvca, vinave
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

  try {
    await pool.query(sql, values);
    //console.log(`✅ Dữ liệu đã lưu vào bảng ${tableName}`);
  } catch (err) {
    console.error('❌ Lỗi SQL:', err.message);
  }

  const [deviceRows] = await pool.query(
    `SELECT rated_current FROM DeviceConfig WHERE ip = ? AND slave_id = ?`,
    [ip, slaveId]
  );

  if (!deviceRows.length || !deviceRows[0].rated_current) {
    //console.warn(`⚠️ Không tìm thấy dòng định mức cho thiết bị ${deviceKey}`);
    return;
  }

  const ratedCurrent = deviceRows[0].rated_current;

  // Xác định các mức ngưỡng
  const thresholds = {
    lightMin: ratedCurrent * currentSettings1.lightLevel,
    seriousMin: ratedCurrent * currentSettings1.seriousLevel,
    emergency: ratedCurrent * currentSettings1.emergencyLevel
  };

  const currentValues = [values[6], values[7], values[8]]; // current1-3
  let currentSeverity = null;

  for (let val of currentValues) {
    if (val > thresholds.emergency) {
      currentSeverity = 'emergency';
      break;
    } else if (val >= thresholds.seriousMin) {
      currentSeverity = 'serious';
    } else if (val >= thresholds.lightMin) {
      currentSeverity = currentSeverity !== 'serious' ? 'light' : currentSeverity;
    }
  }

  // --- CẢNH BÁO SỤT ÁP ---
  const voltageLineValues = [values[0], values[1], values[2]]; // volts_ii, volts_2, volts_3 (CA, BC, AB)
  const voltagePhaseValues = [values[3], values[4], values[5]]; // volts_4, volts_5, volts_6 (A, B, C)
  let voltageSeverity = null;

  // Pha: chuẩn 220V
  for (let volt of voltagePhaseValues) {
    if (volt < voltageSettingsPhase1.emergencyLevel) {
      voltageSeverity = 'emergency';
      break;
    } else if (volt < voltageSettingsPhase1.seriousLevel) {
      voltageSeverity = 'serious';
    } else if (volt < voltageSettingsPhase1.lightLevel) {
      voltageSeverity = voltageSeverity !== 'serious' ? 'light' : voltageSeverity;
    }
  }

  // Dây: chuẩn 380V
  for (let volt of voltageLineValues) {
    if (volt < voltageSettingsLine1.emergencyLevel) {
      voltageSeverity = 'emergency';
      break;
    } else if (volt < voltageSettingsLine1.seriousLevel) {
      voltageSeverity = 'serious';
    } else if (volt < voltageSettingsLine1.lightLevel) {
      voltageSeverity = voltageSeverity !== 'serious' ? 'light' : voltageSeverity;
    }
  }

  const now = new Date();
  const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeString = now.toTimeString().split(' ')[0]; // HH:MM:SS

  if (!global.errorStates) global.errorStates = {};

  // Nếu có lỗi dòng điện
  if (currentSeverity) {
    const key = `${deviceKey}_current`;
    if (!global.errorStates[key]) {
      global.errorStates[key] = {
        start_time: timeString,
        date: dateString,
        severity: currentSeverity
      };
    } else {
      const prev = global.errorStates[key];
      const levels = { light: 1, serious: 2, emergency: 3 };
      if (levels[currentSeverity] > levels[prev.severity]) {
        global.errorStates[key].severity = currentSeverity;
      }
    }
  } else {
    const key = `${deviceKey}_current`;
    if (global.errorStates[key]) {
      const { start_time, date, severity } = global.errorStates[key];
      const end_time = timeString;
      const duration = Math.abs(
        (new Date(`${date}T${end_time}`) - new Date(`${date}T${start_time}`)) / 1000
      );

      await pool.query(
        `
                INSERT INTO Alarm (location, start_time, end_time, event_date, duration_seconds, severity, type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
        [tableName, start_time, end_time, date, duration, severity, 'current']
      );

      console.log(
        `🔔 Alarm DÒNG: ${deviceKey} | ${severity} | ${start_time} → ${end_time} (${duration}s)`
      );
      delete global.errorStates[key];
    }
  }

  // Nếu có lỗi sụt áp
  if (voltageSeverity) {
    const key = `${deviceKey}_voltage`;
    if (!global.errorStates[key]) {
      global.errorStates[key] = {
        start_time: timeString,
        date: dateString,
        severity: voltageSeverity
      };
    } else {
      const prev = global.errorStates[key];
      const levels = { light: 1, serious: 2, emergency: 3 };
      if (levels[voltageSeverity] > levels[prev.severity]) {
        global.errorStates[key].severity = voltageSeverity;
      }
    }
  } else {
    const key = `${deviceKey}_voltage`;
    if (global.errorStates[key]) {
      const { start_time, date, severity } = global.errorStates[key];
      const end_time = timeString;
      const duration = Math.abs(
        (new Date(`${date}T${end_time}`) - new Date(`${date}T${start_time}`)) / 1000
      );

      await pool.query(
        `
                INSERT INTO Alarm (location, start_time, end_time, event_date, duration_seconds, severity, type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
        [tableName, start_time, end_time, date, duration, severity, 'voltage']
      );

      console.log(
        `🔔 Alarm ÁP: ${deviceKey} | ${severity} | ${start_time} → ${end_time} (${duration}s)`
      );
      delete global.errorStates[key];
    }
  }
}

// API lấy dữ liệu từ MySQL cho biểu đồ
app.get('/get_data', async (req, res) => {
  const { ip, id, range } = req.query;
  if (!ip || !id) {
    return res.status(400).json({ error: 'Thiếu IP hoặc ID thiết bị!' });
  }

  const timeMap = { '5p': 5, '10p': 10, '15p': 15 };
  const minutes = timeMap[range] || 5;
  const tableName = `modbus_data_${ip.replace(/\./g, '_')}_${id}`;

  const query = `
        SELECT timestamp, volts_4, volts_5, volts_6, current1, current2, current3, power1, power2, power3, power_factor_total, hdia, hdib, hdic
        FROM ${tableName}
        WHERE timestamp >= NOW() - INTERVAL ${minutes} MINUTE
        ORDER BY timestamp ASC
    `;

  try {
    console.log('📝 SQL Query:', query);
    const [results] = await pool.query(query, [minutes]); // 🟢 Dùng await
    res.json(results);
  } catch (err) {
    console.error('❌ Lỗi MySQL:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const gata_way = [
  { ip: '127.0.0.1', id: 'device1' },
  { ip: '127.0.0.2', id: 'device2' },
  { ip: '127.0.0.3', id: 'device3' },
  { ip: '172.0.0.4', id: 'device4' }
];

app.get('/api/gataway-status', async (req, res) => {
  let results = {};
  for (let gateway of gata_way) {
    const isAlive = await ping.promise.probe(gateway.ip, { timeout: 2 });
    results[gateway.id] = isAlive.alive;
  }
  res.json(results);
});

app.get('/test_db', (req, res) => {
  pool.query('SELECT 1+1 AS test', (err, results) => {
    if (err) {
      console.error('❌ MySQL không phản hồi:', err.message);
      return res.status(500).json({ error: 'MySQL không phản hồi!' });
    }
    console.log('✅ MySQL OK:', results);
    res.json({ message: 'MySQL kết nối thành công!', data: results });
  });
});

app.get('/api/getWeeklyEnergy', async (req, res) => {
  try {
    const deviceIPs = ['127_0_0_1', '127_0_0_2', '127_0_0_3', '127_0_0_4'];
    let labels = [];
    let data = [];

    for (let ip of deviceIPs) {
      let totalImport = 0;
      for (let slaveId of [1, 2, 3]) {
        const tableName = `modbus_data_${ip}_${slaveId}`;
        const sql = `
                    SELECT SUM(kwh_import) AS total_import
                    FROM ${tableName}
                    WHERE timestamp >= CURDATE() - INTERVAL 6 DAY;
                `;

        try {
          const [rows] = await pool.query(sql);
          if (rows[0] && rows[0].total_import !== null) {
            totalImport += rows[0].total_import;
          }
        } catch (err) {
          console.error(`❌ Lỗi truy vấn bảng ${tableName}:`, err.message);
        }
      }
      labels.push(ip.replace(/_/g, '.')); // Chuyển về dạng IP gốc
      data.push(totalImport);
    }

    res.json({ labels, data });
  } catch (error) {
    console.error('❌ Lỗi server:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.get('/api/getDayValue', async (req, res) => {
  try {
    const selectedDate = req.query.date; // Nhận ngày từ frontend (YYYY-MM-DD)
    if (!selectedDate) {
      return res.status(400).json({ error: 'Thiếu ngày cần truy vấn' });
    }

    const deviceIPs = ['127_0_0_1', '127_0_0_2', '127_0_0_3', '127_0_0_4'];
    let labels = [];
    let data = [];

    for (let ip of deviceIPs) {
      let totalImport = 0;
      for (let slaveId of [1, 2, 3]) {
        const tableName = `modbus_data_${ip}_${slaveId}`;
        const sql = `
                    SELECT SUM(kwh_import) AS total_import
                    FROM ${tableName}
                    WHERE DATE(timestamp) = ?;
                `;

        try {
          const [rows] = await pool.query(sql, [selectedDate]);
          if (rows[0] && rows[0].total_import !== null) {
            totalImport += rows[0].total_import;
          }
        } catch (err) {
          console.error(`❌ Lỗi truy vấn bảng ${tableName}:`, err.message);
        }
      }
      labels.push(ip.replace(/_/g, '.')); // Chuyển về dạng IP gốc
      data.push(totalImport);
    }

    res.json({ labels, data });
  } catch (error) {
    console.error('❌ Lỗi server:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.get('/api/getMonthValue', async (req, res) => {
  try {
    const selectedMonth = req.query.month; // Nhận tháng từ frontend (YYYY-MM)
    if (!selectedMonth) {
      return res.status(400).json({ error: 'Thiếu tháng cần truy vấn' });
    }

    const deviceIPs = ['127_0_0_1', '127_0_0_2', '127_0_0_3', '127_0_0_4'];
    let labels = [];
    let data = [];

    for (let ip of deviceIPs) {
      let totalImport = 0;
      for (let slaveId of [1, 2, 3]) {
        const tableName = `modbus_data_${ip}_${slaveId}`;
        const sql = `
                    SELECT SUM(kwh_import) AS total_import
                    FROM ${tableName}
                    WHERE DATE_FORMAT(timestamp, '%Y-%m') = ?;
                `;

        try {
          const [rows] = await pool.query(sql, [selectedMonth]);
          if (rows[0] && rows[0].total_import !== null) {
            totalImport += rows[0].total_import;
          }
        } catch (err) {
          console.error(`❌ Lỗi truy vấn bảng ${tableName}:`, err.message);
        }
      }
      labels.push(ip.replace(/_/g, '.')); // Chuyển về dạng IP gốc
      data.push(totalImport);
    }

    res.json({ labels, data });
  } catch (error) {
    console.error('❌ Lỗi server:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.get('/api/getMonthSummary', async (req, res) => {
  try {
    const selectedMonth = req.query.month; // Nhận tháng từ frontend (YYYY-MM)
    if (!selectedMonth) {
      return res.status(400).json({ error: 'Thiếu tháng cần truy vấn' });
    }

    const deviceIPs = ['127_0_0_1', '127_0_0_2', '127_0_0_3', '127_0_0_4'];
    let dailyTotals = Array(31).fill(0); // Mảng 31 ngày, mặc định là 0

    for (let ip of deviceIPs) {
      for (let slaveId of [1, 2, 3]) {
        const tableName = `modbus_data_${ip}_${slaveId}`;
        const sql = `
                    SELECT 
                        DAY(timestamp) AS day, 
                        SUM(kwh_import) AS total_import
                    FROM ${tableName}
                    WHERE DATE_FORMAT(timestamp, '%Y-%m') = ?
                    GROUP BY day
                    ORDER BY day;
                `;

        try {
          const [rows] = await pool.query(sql, [selectedMonth]);
          rows.forEach((row) => {
            dailyTotals[row.day - 1] += row.total_import || 0; // Cộng dồn giá trị
          });
        } catch (err) {
          console.error(`❌ Lỗi truy vấn bảng ${tableName}:`, err.message);
        }
      }
    }

    res.json({
      labels: Array.from({ length: 31 }, (_, i) => i + 1), // Tạo mảng từ 1 đến 31
      data: dailyTotals
    });
  } catch (error) {
    console.error('❌ Lỗi server:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

async function getModbusTables() {
  const [tables] = await pool.query('SHOW TABLES');
  return tables.map((row) => Object.values(row)[0]); // Lấy tên bảng
}

// API lấy dữ liệu theo tháng
app.get('/api/getMonthlyData', async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'Thiếu tham số month hoặc year' });

  try {
    const [tables] = await pool.query('SHOW TABLES');
    let tableNames = tables.map((row) => Object.values(row)[0]); // Danh sách tên bảng

    tableNames = tableNames.filter(
      (table) =>
        ![
          'alarm',
          'modbus_disconnect_log',
          'modbus_disconnect_summary',
          'deviceconfig',
          'warning-current-1',
          'warning-vol-line-1',
          'warning-vol-phase-1',
          'users'
        ].includes(table)
    );

    let reportData = [];

    for (let table of tableNames) {
      // ✅ Lấy danh sách ngày có dữ liệu trong tháng
      const [dates] = await pool.query(
        `
                SELECT DISTINCT DATE(timestamp) AS date
                FROM ${table}
                WHERE YEAR(timestamp) = ? AND MONTH(timestamp) = ?
                ORDER BY date ASC
            `,
        [year, month]
      );

      if (dates.length === 0) continue; // Nếu bảng không có dữ liệu, bỏ qua

      let prevEndValue = 0; // Lưu trữ end_value của ngày trước đó

      for (let i = 0; i < dates.length; i++) {
        const date = dates[i].date;
        const period = new Date(date).toLocaleDateString('vi-VN'); // Format dd-mm-yyyy

        // ✅ Tính Total (Tổng kwh_import trong ngày)
        const [[{ total }]] = await pool.query(
          `
                    SELECT SUM(kwh_import) AS total 
                    FROM ${table}
                    WHERE DATE(timestamp) = ?
                `,
          [date]
        );

        // ✅ Lấy giá trị kwh_import đầu tiên trong ngày
        const [[{ startValue }]] = await pool.query(
          `
                    SELECT kwh_import AS startValue
                    FROM ${table}
                    WHERE DATE(timestamp) = ?
                    ORDER BY timestamp ASC
                    LIMIT 1
                `,
          [date]
        );

        let start_value, end_value;

        if (i === 0) {
          // Ngày đầu tiên có dữ liệu
          start_value = startValue;
          end_value = start_value + total;
        } else {
          // Từ ngày thứ 2 trở đi
          start_value = prevEndValue + startValue;
          end_value = prevEndValue + total;
        }

        prevEndValue = end_value; // Cập nhật giá trị cho ngày tiếp theo

        reportData.push({
          source: table,
          period,
          total: total || 0,
          start_value,
          end_value
        });
      }
    }

    res.json(reportData);
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// API lấy dữ liệu từ bảng Alarm theo bộ lọc thời gian
app.get('/api/getAlarmData', async (req, res) => {
  const { filter, month, type } = req.query;
  let condition = 'WHERE 1=1';

  if (type) {
    condition += ` AND type = ${pool.escape(type)}`; // tránh SQL injection
  }

  if (filter === 'last7days') {
    condition += ' AND event_date BETWEEN CURDATE() - INTERVAL 6 DAY AND CURDATE()';
    console.log('📢 Xuất dữ liệu theo: Last 7 Days');
  } else if (filter === 'today') {
    condition += ' AND event_date = CURDATE()';
    console.log('📢 Xuất dữ liệu theo: Today');
  } else if (filter === 'thisMonth') {
    condition += ' AND MONTH(event_date) = MONTH(CURDATE()) AND YEAR(event_date) = YEAR(CURDATE())';
    console.log('📢 Xuất dữ liệu theo: This Month');
  } else if (month) {
    const [year, monthValue] = month.split('-');
    condition += ` AND MONTH(event_date) = ${monthValue} AND YEAR(event_date) = ${year}`;
    console.log(`📢 Xuất dữ liệu theo: Tháng ${monthValue}-${year}`);
  }

  try {
    const [rows] = await pool.query(`
            SELECT location, 
                   DATE_FORMAT(event_date, '%d-%m-%Y') AS date, 
                   start_time, 
                   duration_seconds, 
                   severity
            FROM Alarm ${condition} 
            ORDER BY event_date DESC, start_time DESC
        `);

    res.json(rows);
  } catch (err) {
    console.error('❌ Lỗi khi lấy dữ liệu từ bảng Alarm:', err.message);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

async function createTables() {
  const connection = await pool.getConnection();
  try {
    // Bảng lưu trạng thái thay đổi (0 -> 1 hoặc 1 -> 0)
    await connection.query(`
            CREATE TABLE IF NOT EXISTS modbus_disconnect_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_ip VARCHAR(50),
                slave_id INT,
                status TINYINT(1), -- 0: Mất kết nối, 1: Kết nối lại
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Bảng lưu thông tin mất kết nối tổng hợp
    await connection.query(`
            CREATE TABLE IF NOT EXISTS modbus_disconnect_summary (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_ip VARCHAR(50),
                slave_id INT,
                disconnect_time DATETIME,
                reconnect_time DATETIME,
                duration_seconds INT
            )
        `);
    console.log('✅ Bảng đã được tạo hoặc đã tồn tại.');
  } catch (error) {
    console.error('❌ Lỗi tạo bảng:', error);
  } finally {
    connection.release();
  }
}

createTables();
let lastStatus = {}; // Khai báo biến để lưu trạng thái trước đó của thiết bị

async function checkModbusStatus() {
  const connection = await pool.getConnection();
  try {
    for (let device of MODBUS_DEVICES) {
      const client = new ModbusRTU();
      try {
        await client.connectTCP(device.ip, { port: MODBUS_PORT });

        for (let slaveId of device.slaveIds) {
          try {
            client.setID(slaveId);
            client.setTimeout(1000);
            await client.readHoldingRegisters(0, 1);
            await handleStatusChange(device.ip, slaveId, 1, connection);
          } catch {
            await handleStatusChange(device.ip, slaveId, 0, connection);
          }
        }
      } catch {
        for (let slaveId of device.slaveIds) {
          await handleStatusChange(device.ip, slaveId, 0, connection);
        }
      } finally {
        client.close();
      }
    }
  } catch (error) {
    console.error('Lỗi khi kiểm tra Modbus:', error);
  } finally {
    connection.release();
  }
}

// Xử lý lưu trạng thái vào MySQL
async function handleStatusChange(device_ip, slave_id, newStatus, connection) {
  const key = `${device_ip}-${slave_id}`;
  if (lastStatus[key] !== undefined && lastStatus[key] === newStatus) return;

  // Lưu vào bảng modbus_disconnect_log
  await connection.query(
    `INSERT INTO modbus_disconnect_log (device_ip, slave_id, status) VALUES (?, ?, ?)`,
    [device_ip, slave_id, newStatus]
  );

  if (newStatus === 1) {
    // Nếu trạng thái mới là 1 (kết nối lại), tìm lần mất kết nối gần nhất
    const [[lastDisconnect]] = await connection.query(
      `SELECT timestamp FROM modbus_disconnect_log 
             WHERE device_ip = ? AND slave_id = ? AND status = 0 
             ORDER BY timestamp DESC LIMIT 1`,
      [device_ip, slave_id]
    );

    if (lastDisconnect) {
      const disconnectTime = lastDisconnect.timestamp;
      const reconnectTime = new Date();
      const durationSeconds = Math.round((reconnectTime - disconnectTime) / 1000);

      // Kiểm tra xem đã có bản ghi nào cùng disconnect_time chưa
      const [[existingRecord]] = await connection.query(
        `SELECT id FROM modbus_disconnect_summary 
                 WHERE device_ip = ? AND slave_id = ? AND disconnect_time = ? 
                 LIMIT 1`,
        [device_ip, slave_id, disconnectTime]
      );

      if (!existingRecord) {
        // Chỉ lưu nếu chưa có bản ghi nào cho disconnect_time này
        await connection.query(
          `INSERT INTO modbus_disconnect_summary (device_ip, slave_id, disconnect_time, reconnect_time, duration_seconds) 
                     VALUES (?, ?, ?, ?, ?)`,
          [device_ip, slave_id, disconnectTime, reconnectTime, durationSeconds]
        );
      }
    }
  }

  lastStatus[key] = newStatus;
}

app.get('/api/disconnect-stats', async (req, res) => {
  const { filter } = req.query;
  console.log('Filter nhận được:', filter);

  if (!filter) {
    console.log('Không có filter được cung cấp');
    return res.status(400).json({ error: 'Filter is required' });
  }

  let whereClause = '';
  const params = [];

  if (filter === 'today') {
    whereClause = `DATE(disconnect_time) = CURDATE()`;
  } else if (filter === 'last7days') {
    whereClause = `DATE(disconnect_time) >= CURDATE() - INTERVAL 7 DAY`;
  } else if (filter === 'thismonth') {
    whereClause = `MONTH(disconnect_time) = MONTH(CURDATE()) AND YEAR(disconnect_time) = YEAR(CURDATE())`;
  } else if (filter.startsWith('month=')) {
    const [year, month] = filter.split('=')[1].split('-');
    if (!year || !month) {
      console.log('Month filter không hợp lệ:', filter);
      return res.status(400).json({ error: 'Invalid month format' });
    }
    whereClause = `MONTH(disconnect_time) = ? AND YEAR(disconnect_time) = ?`;
    params.push(parseInt(month), parseInt(year));
  } else {
    console.log('Filter không hợp lệ:', filter);
    return res.status(400).json({ error: 'Invalid filter' });
  }

  const query = `
        SELECT 
            device_ip,
            slave_id,
            COUNT(*) as count
        FROM modbus_disconnect_summary
        WHERE ${whereClause}
        GROUP BY device_ip, slave_id
    `;

  try {
    const [rows] = await pool.query(query, params);
    console.log('Kết quả truy vấn:', rows);

    const result = {};

    for (let row of rows) {
      const ipLast = row.device_ip.split('.').pop(); // Lấy phần cuối của IP, ví dụ: "127.0.0.1" → "1"
      const key = `${ipLast}-${row.slave_id}`; // Ví dụ: "1-1"
      result[key] = { device: key, count: row.count };
    }

    res.json(Object.values(result));
  } catch (err) {
    console.error('❌ Error fetching disconnect stats:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Gọi checkModbusStatus mỗi 5 giây
setInterval(checkModbusStatus, 5000);

app.get('/api/disconnect-summary', async (req, res) => {
  try {
    const [data] = await pool.query(
      `SELECT * FROM modbus_disconnect_summary ORDER BY disconnect_time DESC`
    );
    res.json(data);
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu summary:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// API lấy dữ liệu modbus_disconnect_log
app.get('/api/disconnect-log', async (req, res) => {
  try {
    const [data] = await pool.query(`SELECT * FROM modbus_disconnect_log ORDER BY timestamp DESC`);
    res.json(data);
  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu log:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.get('/get-disconnect-summary', async (req, res) => {
  try {
    const { filter, month } = req.query;
    let query =
      'SELECT device_ip, slave_id, disconnect_time, duration_seconds FROM modbus_disconnect_summary';
    let params = [];

    // Lọc theo thời gian
    if (filter === 'last7days') {
      query += ' WHERE DATE(disconnect_time) >= CURDATE() - INTERVAL 6 DAY';
    } else if (filter === 'today') {
      query += ' WHERE DATE(disconnect_time) = CURDATE()';
    } else if (filter === 'thismonth') {
      query +=
        ' WHERE MONTH(disconnect_time) = MONTH(CURDATE()) AND YEAR(disconnect_time) = YEAR(CURDATE())';
    } else if (month) {
      query += " WHERE DATE_FORMAT(disconnect_time, '%Y-%m') = ?";
      params.push(month);
    }
    query += ' ORDER BY DATE(disconnect_time) ASC, TIME(disconnect_time) ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Lỗi khi truy vấn dữ liệu:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.get('/api/alarm-stats', async (req, res) => {
  const { filter, type } = req.query;

  // Kiểm tra type hợp lệ
  if (!['current', 'voltage'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type. Must be "current" or "voltage"' });
  }

  let whereClause = '';
  const params = [];

  // Xử lý filter thời gian
  if (filter === 'today') {
    whereClause = `event_date = CURDATE()`;
  } else if (filter === 'last7days') {
    whereClause = `event_date >= CURDATE() - INTERVAL 7 DAY`;
  } else if (filter === 'thismonth') {
    whereClause = `MONTH(event_date) = MONTH(CURDATE()) AND YEAR(event_date) = YEAR(CURDATE())`;
  } else if (filter?.startsWith('month=')) {
    const [year, month] = filter.split('=')[1].split('-');
    whereClause = `MONTH(event_date) = ? AND YEAR(event_date) = ?`;
    params.push(parseInt(month), parseInt(year));
  } else {
    return res.status(400).json({ error: 'Invalid filter' });
  }

  // Thêm điều kiện type
  whereClause += ` AND type = ?`;
  params.push(type);

  const query = `
        SELECT 
            location,
            severity,
            COUNT(*) as count
        FROM Alarm
        WHERE ${whereClause}
        GROUP BY location, severity
    `;

  try {
    const [rows] = await pool.query(query, params);

    const result = {};

    for (let row of rows) {
      // Lấy phần cuối IP và ID từ location: modbus_data_127_0_0_1_1 → 1-1
      const parts = row.location.split('_');
      const ipLast = parts[5];
      const slaveId = parts[6];
      const key = `${ipLast}-${slaveId}`;

      if (!result[key]) {
        result[key] = { device: key, light: 0, serious: 0, emergency: 0 };
      }

      result[key][row.severity] = row.count;
    }

    res.json(Object.values(result));
  } catch (err) {
    console.error('❌ Error fetching alarm stats:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(3000, () => {
  console.log('🚀 Server đang chạy trên http://localhost:3000');
});

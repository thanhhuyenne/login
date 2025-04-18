const bcrypt = require('bcrypt');

async function hashPassword() {
    const password = '123456'; // Mật khẩu plaintext
    const saltRounds = 10; // Độ phức tạp của mã hóa
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log('Mật khẩu đã mã hóa:', hashedPassword);
}

hashPassword();
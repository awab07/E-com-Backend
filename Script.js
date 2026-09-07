import bcrypt from 'bcrypt';
const password = "TripleBuzz123"
const newPassword = async (password) => {
    try {
        const HashedPassword = await bcrypt.hash(password, 10)
        console.log(HashedPassword)
        
    } catch (error) {
        console.log(error)
    }
}
newPassword(password)
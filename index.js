const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

app.use(cors());
app.use(express.json());

const port = 3000;
const JWT_SECRET = "superSecretJWTKey123!"; 
const ADMIN_SECRET = "superAdminSecretKey456!"; 
const userFilePath = path.join(__dirname, './users.json');
const adminFilePath = path.join(__dirname, './admin.json');
const blogFilePath = path.join(__dirname, './blogs.json');
const commentFilePath = path.join(__dirname, './comments.json');


let users = JSON.parse(fs.readFileSync(userFilePath, 'utf-8') || '[]');
let admins = JSON.parse(fs.readFileSync(adminFilePath, 'utf-8') || '[]');
let blogs = JSON.parse(fs.readFileSync(blogFilePath, 'utf-8') || '[]');
let comments = JSON.parse(fs.readFileSync(commentFilePath, 'utf-8') || '[]');


const saveData = () => fs.writeFileSync(userFilePath, JSON.stringify(users, null, 2), 'utf-8');
const saveAdminData = () => fs.writeFileSync(adminFilePath, JSON.stringify(admins, null, 2), 'utf-8');
const saveBlogData = () => fs.writeFileSync(blogFilePath, JSON.stringify(blogs, null, 2), 'utf-8');
const saveCommentData = () => fs.writeFileSync(commentFilePath, JSON.stringify(comments, null, 2), 'utf-8');


const loadUsers = () => {
    const data = fs.readFileSync(path.join(__dirname, 'users.json'));
    return JSON.parse(data);
};

app.get('/', (req, res) => {
    res.send('WELCOME TO THE BLOG APP');
});

app.post('/register', async (req, res) => {
    console.log(req.body); 
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).send('Please provide all details');

    const existingUser = users.find(user => user.email === email);
    const existingAdmin = admins.find(admin => admin.email === email);
    if (existingUser || existingAdmin) return res.status(400).send('User already exists');

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = users.length + admins.length + 1; 

    
    if (id === 1) {
        const newAdmin = { id, email, password: hashedPassword, role: 'admin', registered: true };
        admins.push(newAdmin);
        saveAdminData();
        return res.status(201).send('First user registered as admin successfully');
    }

    // For all subsequent users, register as a regular user without assigning a role
    if (id > 1) {
        const newUser = { id, email, password: hashedPassword, registered: true };
        users.push(newUser);
        saveData();
        return res.status(201).send('User registered successfully');
    }
});

// Login route for users and admins
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    let user = users.find(user => user.email === email);
    let isAdmin = false;

    if (!user) {
        user = admins.find(admin => admin.email === email);
        if (!user) return res.status(400).send('User not found');
        isAdmin = true;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(400).send('Invalid password');

    const token = jwt.sign({ id: user.id, role: isAdmin ? 'admin' : 'user' }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});


app.post('/admin/promote', async (req, res) => {
    const { token, email } = req.body;

    try {
        const decoded = jwt.verify(token, ADMIN_SECRET);
        const requestingAdmin = admins.find(admin => admin.id === decoded.id);

        if (!requestingAdmin) return res.status(403).send('Unauthorized: Only admins can promote new admins');

        const userToPromote = users.find(user => user.email === email);
        if (!userToPromote) return res.status(404).send('User not found');

        users = users.filter(user => user.email !== email);
        admins.push(userToPromote);
        saveData();
        saveAdminData();
        res.status(200).send('User promoted to admin');
    } catch (err) {
        res.status(403).send('Invalid token');
    }
});

// Create a new blog (user or admin can create their own blog)
app.post('/blog/create', (req, res) => {
    const { token, title, content } = req.body;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id) || admins.find(a => a.id === decoded.id);
        if (!user) return res.status(403).send('Unauthorized');

        const newBlog = {
            id: blogs.length + 1,
            title,
            content,
            authorId: user.id
        };
        blogs.push(newBlog);
        saveBlogData();
        res.status(201).send('Blog created successfully');
    } catch (err) {
        res.status(403).send('Invalid token');
    }
});


app.put('/blog/update/:id', (req, res) => {
    const { token, title, content } = req.body;
    const blogId = parseInt(req.params.id, 10);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id) || admins.find(a => a.id === decoded.id);

        const blog = blogs.find(b => b.id === blogId);
        if (!blog) return res.status(404).send('Blog not found');

        if (blog.authorId !== decoded.id && decoded.role !== 'admin') {
            return res.status(403).send('Unauthorized to update this blog');
        }

        blog.title = title || blog.title;
        blog.content = content || blog.content;
        saveBlogData();
        res.status(200).send('Blog updated successfully');
    } catch (err) {
        res.status(403).send('Invalid token');
    }
});

// Delete a blog
app.delete('/blog/delete/:id', (req, res) => {
    const { token } = req.body;
    const blogId = parseInt(req.params.id, 10);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id) || admins.find(a => a.id === decoded.id);

        const blog = blogs.find(b => b.id === blogId);
        if (!blog) return res.status(404).send('Blog not found');

        if (blog.authorId !== decoded.id && decoded.role !== 'admin') {
            return res.status(403).send('Unauthorized to delete this blog');
        }

        blogs = blogs.filter(b => b.id !== blogId);
        saveBlogData();
        res.status(200).send('Blog deleted successfully');
    } catch (err) {
        res.status(403).send('Invalid token');
    }
});


app.post('/blog/:id/like', (req, res) => {
    const { userId } = req.body; 
    const blogId = parseInt(req.params.id, 10); 
    const users = loadUsers();


    const user = users.find(u => u.id.toString() === userId);
    if (!user) {
        return res.status(403).send('User not found or unauthorized');
    }
    

    const blog = blogs.find(b => b.id === blogId); 

    if (!blog) {
        return res.status(404).send('Blog not found');
    }

    if (!blog.likes) {
        blog.likes = [];
    }

    const userIndex = blog.likes.indexOf(userId); 

    if (userIndex === -1) { 
        blog.likes.push(userId); 
        res.status(200).send('Blog liked successfully'); 
    } else { 
        blog.likes.splice(userIndex, 1); 
        res.status(200).send('Blog disliked successfully'); 
    }

    saveBlogData(); 
});



app.post('/blog/:id/comment', (req, res) => {
    console.log(req.body); 
    const { token, comment, parentCommentId } = req.body;
    const blogId = parseInt(req.params.id, 10);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.id) || admins.find(a => a.id === decoded.id);
        if (!user) return res.status(403).send('Unauthorized');

        const blog = blogs.find(b => b.id === blogId);
        if (!blog) return res.status(404).send('Blog not found');

        const newCommentId = comments.length > 0 ? comments[comments.length - 1].commentId + 1 : 1;
        const newComment = {
            commentId: newCommentId,
            blogId: blogId,
            userId: user.id,
            comment: comment,
            parentCommentId: parentCommentId || null, 
            date: new Date().toISOString()
        };

        comments.push(newComment);
        saveCommentData();
        res.status(201).send('Comment added successfully');
    } catch (err) {
        res.status(403).send('Invalid token');
    }
});


app.get('/blog/:id/comments', (req, res) => {
    const blogId = parseInt(req.params.id, 10);
    const blogComments = comments.filter(comment => comment.blogId === blogId);

    if (blogComments.length === 0) return res.status(404).send('No comments found for this blog');
    res.status(200).json(blogComments);
});




app.listen(port, () => {
    console.log(Server running on port ${port});
});
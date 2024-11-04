const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = 3000;

app.use(express.json());

const users = [];  // This would typically be a database
const blogs = [];  // This would also typically be a database

// Secret for JWT
const SECRET_KEY = "superSecretJWTKey123!";

// Middleware for checking authentication
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.sendStatus(403);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Middleware for checking roles
const authorizeRole = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({ message: 'Access forbidden' });
        }
        next();
    };
};

// Signup Endpoint
app.post('/signup', async (req, res) => {
    const { username, password, role } = req.body;

    // Check for existing user
    if (users.find(user => user.username === username)) {
        return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = { id: users.length + 1, username, password: hashedPassword, role };
    users.push(user);
    res.status(201).json({ message: 'User registered successfully' });
});

// Login Endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(user => user.username === username);

    if (!user) return res.status(400).json({ message: 'User not found' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ message: 'Invalid password' });

    // Generate JWT Token
    const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
});

// Route to View All Blogs (Accessible by everyone)
app.get('/blogs', (req, res) => {
    res.json(blogs);
});

// Route to Create Blog (Accessible by Registered Users)
app.post('/blogs', authenticateToken, authorizeRole('registered'), (req, res) => {
    const { title, content } = req.body;
    const blog = { id: blogs.length + 1, title, content, authorId: req.user.id };
    blogs.push(blog);
    res.status(201).json({ message: 'Blog created successfully', blog });
});

// Route to Edit Blog (Accessible by Registered Users and Admin)
app.put('/blogs/:id', authenticateToken, (req, res) => {
    const blog = blogs.find(b => b.id === parseInt(req.params.id));
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    if (req.user.role === 'admin' || (req.user.role === 'registered' && blog.authorId === req.user.id)) {
        blog.title = req.body.title || blog.title;
        blog.content = req.body.content || blog.content;
        res.json({ message: 'Blog updated successfully', blog });
    } else {
        res.status(403).json({ message: 'Access forbidden' });
    }
});

// Route to Delete Blog (Accessible by Registered Users)
app.delete('/blogs/:id', authenticateToken, authorizeRole('registered'), (req, res) => {
    const blogIndex = blogs.findIndex(b => b.id === parseInt(req.params.id));
    if (blogIndex === -1) return res.status(404).json({ message: 'Blog not found' });

    const blog = blogs[blogIndex];
    if (blog.authorId === req.user.id) {
        blogs.splice(blogIndex, 1);
        res.json({ message: 'Blog deleted successfully' });
    } else {
        res.status(403).json({ message: 'Access forbidden' });
    }
});

// Route to View All Blogs as Admin
app.get('/admin/blogs', authenticateToken, authorizeRole('admin'), (req, res) => {
    res.json(blogs);
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

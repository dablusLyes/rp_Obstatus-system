const fs = require('fs');
const path = require('path');

// Configuration
const VAULT_ROOT = __dirname;
const OUTPUT_FILE = path.join(VAULT_ROOT, 'index.html');
const IGNORE_DIRS = ['.obsidian', 'node_modules', '.git', '_Indexes'];

// Data structures
const notes = {};
const structure = [];

// Simple Markdown to HTML converter
function markdownToHtml(md) {
    let html = md;

    // Code blocks (do first to avoid processing inside code)
    html = html.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');

    // Headers
    html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
    html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // WikiLinks [[link]] - will be processed later in JS
    html = html.replace(/\[\[([^\]]+)\]\]/gim, '<a href="#" class="wikilink" data-link="$1">$1</a>');

    // Regular links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>');

    // Images ![alt](url)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, '<img src="$2" alt="$1">');

    // Inline code
    html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Horizontal rules
    html = html.replace(/^---$/gim, '<hr>');

    // Paragraphs (split by double newlines)
    const lines = html.split('\n');
    const paragraphs = [];
    let currentPara = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            if (currentPara.length > 0) {
                paragraphs.push(currentPara.join('\n'));
                currentPara = [];
            }
        } else if (line.startsWith('<') || line.match(/^<[h|u|o|p|d]/)) {
            if (currentPara.length > 0) {
                paragraphs.push(currentPara.join('\n'));
                currentPara = [];
            }
            paragraphs.push(line);
        } else {
            currentPara.push(line);
        }
    }
    if (currentPara.length > 0) {
        paragraphs.push(currentPara.join('\n'));
    }

    html = paragraphs.map(p => {
        p = p.trim();
        if (!p || p.startsWith('<')) return p;
        return '<p>' + p + '</p>';
    }).join('\n');

    // Lists
    html = html.replace(/^\- (.+)$/gim, '<li>$1</li>');
    html = html.replace(/^\+ (.+)$/gim, '<li>$1</li>');
    html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, (match) => {
        return '<ul>' + match + '</ul>';
    });

    // Numbered lists
    html = html.replace(/^\d+\. (.+)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, (match, offset, string) => {
        // Check if previous was numbered list
        const before = string.substring(0, offset);
        if (before.match(/<ol>/)) return match;
        return '<ol>' + match + '</ol>';
    });

    return html;
}

// Recursively scan directory
function scanDirectory(dirPath, relativePath = '') {
    const items = [];

    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        // Sort: directories first, then files
        entries.sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) {
                return a.isDirectory() ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

            // Skip ignored directories
            if (entry.isDirectory() && IGNORE_DIRS.includes(entry.name)) {
                continue;
            }

            // Skip build script and output file
            if (entry.isFile() && (entry.name === 'build-wiki.js' || entry.name === 'index.html' || entry.name === 'package.json')) {
                continue;
            }

            if (entry.isDirectory()) {
                const subItems = scanDirectory(fullPath, relPath);
                if (subItems.length > 0) {
                    items.push({
                        type: 'folder',
                        name: entry.name,
                        path: relPath,
                        children: subItems
                    });
                }
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                const noteId = entry.name.replace('.md', '');
                const fileContent = fs.readFileSync(fullPath, 'utf-8');
                const htmlContent = markdownToHtml(fileContent);

                // Store note
                notes[noteId] = {
                    id: noteId,
                    name: noteId,
                    path: relPath,
                    content: htmlContent,
                    rawContent: fileContent
                };

                items.push({
                    type: 'file',
                    name: noteId,
                    path: relPath,
                    noteId: noteId
                });
            }
        }
    } catch (err) {
        console.error(`Error scanning ${dirPath}:`, err.message);
    }

    return items;
}

// Generate HTML
function generateHTML() {
    const structureJson = JSON.stringify(structure).replace(/</g, '\\u003c');
    const notesJson = JSON.stringify(notes).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Obsatus System Wiki</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@200;300;500&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #ffffff;
            --bg-secondary: #f5f5f5;
            --bg-sidebar: #f5f5f5;
            --text-primary: #1a1a1a;
            --text-secondary: #666666;
            --text-sidebar: #1a1a1a;
            --border-color: #e0e0e0;
            --link-color: #2563eb;
            --link-hover: #1d4ed8;
            --code-bg: #f4f4f4;
            --code-text: #d63384;
            --shadow: rgba(0, 0, 0, 0.1);
        }

        [data-theme="dark"] {
            --bg-primary: #1a1a1a;
            --bg-secondary: #2d2d2d;
            --bg-sidebar: #1a1a1a;
            --text-primary: #e0e0e0;
            --text-secondary: #a0a0a0;
            --text-sidebar: #e0e0e0;
            --border-color: #404040;
            --link-color: #60a5fa;
            --link-hover: #93c5fd;
            --code-bg: #2d2d2d;
            --code-text: #f472b6;
            --shadow: rgba(0, 0, 0, 0.3);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Roboto', sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            transition: background-color 0.3s ease, color 0.3s ease;
        }

        /* Header */
        header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 60px;
            background-color: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            z-index: 1000;
            box-shadow: 0 2px 4px var(--shadow);
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .sidebar-toggle {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: var(--text-primary);
            padding: 5px 10px;
            border-radius: 4px;
            transition: background-color 0.2s;
        }

        .sidebar-toggle:hover {
            background-color: var(--bg-primary);
        }

        .theme-toggle {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: var(--text-primary);
            padding: 8px;
            border-radius: 4px;
            transition: background-color 0.2s;
        }

        .theme-toggle:hover {
            background-color: var(--bg-primary);
        }

        /* Sidebar */
        .sidebar {
            position: fixed;
            left: 0;
            top: 60px;
            width: 300px;
            height: calc(100vh - 60px);
            background-color: var(--bg-sidebar);
            border-right: 1px solid var(--border-color);
            overflow-y: auto;
            transition: transform 0.3s ease;
            z-index: 999;
            padding: 20px;
        }

        .sidebar.hidden {
            transform: translateX(-100%);
        }

        .sidebar h2 {
            font-family: 'Source Serif 4', serif;
            font-weight: 500;
            font-size: 20px;
            color: #000000;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border-color);
        }

        .file-tree {
            list-style: none;
        }

        .file-tree li {
            padding: 6px 0;
            cursor: pointer;
            color: var(--text-sidebar);
            font-family: 'Source Serif 4', serif;
            font-size: 14px;
            transition: color 0.2s;
        }

        .file-tree li:hover {
            color: var(--link-color);
        }

        .file-tree li.folder {
            font-weight: 500;
            color: var(--link-color);
            user-select: none;
        }

        .file-tree li.folder::before {
            content: '📁 ';
            margin-right: 5px;
        }

        .file-tree li.file::before {
            content: '📄 ';
            margin-right: 5px;
        }

        .file-tree li.active {
            color: var(--link-color);
            font-weight: 500;
        }

        .file-tree li.collapsed > ul {
            display: none;
        }

        .file-tree ul {
            margin-left: 20px;
            margin-top: 5px;
            list-style: none;
        }

        /* Main Content */
        .main-content {
            margin-left: 300px;
            margin-top: 60px;
            padding: 40px;
            max-width: 900px;
            transition: margin-left 0.3s ease;
        }

        .main-content.sidebar-hidden {
            margin-left: 0;
        }

        .note-content {
            display: none;
        }

        .note-content.active {
            display: block;
        }

        .note-content h1 {
            font-family: 'Source Serif 4', serif;
            font-weight: 500;
            font-size: 36px;
            color: #000000;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid var(--border-color);
        }

        .note-content h2 {
            font-family: 'Source Serif 4', serif;
            font-weight: 500;
            font-size: 28px;
            color: #000000;
            margin-top: 30px;
            margin-bottom: 15px;
        }

        .note-content h3 {
            font-family: 'Source Serif 4', serif;
            font-weight: 500;
            font-size: 24px;
            color: #000000;
            margin-top: 25px;
            margin-bottom: 12px;
        }

        .note-content h4, .note-content h5, .note-content h6 {
            font-family: 'Source Serif 4', serif;
            font-weight: 500;
            color: #000000;
            margin-top: 20px;
            margin-bottom: 10px;
        }

        .note-content p {
            margin-bottom: 15px;
            color: var(--text-primary);
        }

        .note-content a {
            color: var(--link-color);
            text-decoration: none;
            border-bottom: 1px solid transparent;
            transition: border-color 0.2s;
        }

        .note-content a:hover {
            border-bottom-color: var(--link-color);
        }

        .note-content a.wikilink {
            color: var(--link-color);
            font-weight: 500;
        }

        .note-content strong {
            font-weight: 500;
            color: var(--text-primary);
        }

        .note-content em {
            font-style: italic;
            color: var(--text-secondary);
        }

        .note-content code {
            background-color: var(--code-bg);
            color: var(--code-text);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }

        .note-content pre {
            background-color: var(--code-bg);
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            margin: 15px 0;
            border: 1px solid var(--border-color);
        }

        .note-content pre code {
            background: none;
            padding: 0;
            color: var(--text-primary);
        }

        .note-content ul, .note-content ol {
            margin-left: 25px;
            margin-bottom: 15px;
        }

        .note-content li {
            margin-bottom: 8px;
        }

        .note-content img {
            max-width: 100%;
            height: auto;
            border-radius: 5px;
            margin: 20px 0;
            box-shadow: 0 2px 8px var(--shadow);
        }

        .note-content hr {
            border: none;
            border-top: 1px solid var(--border-color);
            margin: 30px 0;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--text-secondary);
        }

        .empty-state h2 {
            font-family: 'Source Serif 4', serif;
            font-weight: 500;
            font-size: 32px;
            margin-bottom: 15px;
        }

        @media (max-width: 768px) {
            .sidebar {
                width: 100%;
            }

            .main-content {
                margin-left: 0;
            }

            .main-content.sidebar-hidden {
                margin-left: 0;
            }
        }
    </style>
</head>
<body data-theme="light">
    <header>
        <div class="header-left">
            <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar">☰</button>
            <h1 style="font-family: 'Source Serif 4', serif; font-weight: 500; font-size: 24px; color: #000000;">Obsatus System</h1>
        </div>
        <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">🌙</button>
    </header>

    <aside class="sidebar" id="sidebar">
        <h2>Vault</h2>
        <ul class="file-tree" id="fileTree"></ul>
    </aside>

    <main class="main-content" id="mainContent">
        <div class="empty-state" id="emptyState">
            <h2>Welcome</h2>
            <p>Select a note from the sidebar to begin.</p>
        </div>
        <div id="notesContainer"></div>
    </main>

    <script>
        const notes = ${notesJson};
        const structure = ${structureJson};
        const fileTree = document.getElementById('fileTree');
        const notesContainer = document.getElementById('notesContainer');
        const emptyState = document.getElementById('emptyState');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const themeToggle = document.getElementById('themeToggle');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');

        // Initialize theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);

        // Theme toggle
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });

        function updateThemeIcon(theme) {
            themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
        }

        // Sidebar toggle
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
            mainContent.classList.toggle('sidebar-hidden');
        });

        // Build file tree
        function buildFileTree(items, parentList) {
            items.forEach(item => {
                const li = document.createElement('li');

                if (item.type === 'folder') {
                    li.className = 'folder';
                    li.textContent = item.name;
                    li.addEventListener('click', (e) => {
                        e.stopPropagation();
                        li.classList.toggle('collapsed');
                    });

                    const ul = document.createElement('ul');
                    if (item.children && item.children.length > 0) {
                        buildFileTree(item.children, ul);
                    }
                    li.appendChild(ul);
                    parentList.appendChild(li);
                } else if (item.type === 'file') {
                    li.className = 'file';
                    li.textContent = item.name;
                    li.addEventListener('click', (e) => {
                        e.stopPropagation();
                        loadNote(item.noteId);
                        // Update active state
                        document.querySelectorAll('.file-tree li').forEach(l => l.classList.remove('active'));
                        li.classList.add('active');
                    });
                    parentList.appendChild(li);
                }
            });
        }

        // Load note
        function loadNote(noteId) {
            const note = notes[noteId];
            if (!note) {
                console.error('Note not found:', noteId);
                return;
            }

            emptyState.style.display = 'none';

            // Check if note content already exists
            let noteDiv = document.getElementById('note-' + noteId);
            if (!noteDiv) {
                noteDiv = document.createElement('div');
                noteDiv.id = 'note-' + noteId;
                noteDiv.className = 'note-content';
                noteDiv.innerHTML = note.content;
                notesContainer.appendChild(noteDiv);

                // Attach wiki link listeners
                attachWikiLinkListeners(noteDiv);
            }

            // Hide all notes and show selected
            document.querySelectorAll('.note-content').forEach(n => n.classList.remove('active'));
            noteDiv.classList.add('active');

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Wiki link navigation
        function attachWikiLinkListeners(container) {
            container.querySelectorAll('.wikilink').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const linkName = link.dataset.link;
                    const searchName = linkName.toLowerCase();

                    // Try exact match
                    let foundNoteId = null;
                    for (const noteId in notes) {
                        if (noteId.toLowerCase() === searchName) {
                            foundNoteId = noteId;
                            break;
                        }
                    }

                    // Try partial match
                    if (!foundNoteId) {
                        for (const noteId in notes) {
                            if (noteId.toLowerCase().includes(searchName) || searchName.includes(noteId.toLowerCase())) {
                                foundNoteId = noteId;
                                break;
                            }
                        }
                    }

                    if (foundNoteId) {
                        loadNote(foundNoteId);
                        // Update active state in sidebar
                        document.querySelectorAll('.file-tree li').forEach(l => {
                            if (l.textContent.includes(notes[foundNoteId].name)) {
                                document.querySelectorAll('.file-tree li').forEach(li => li.classList.remove('active'));
                                l.classList.add('active');
                            }
                        });
                    } else {
                        console.log('Note not found:', linkName);
                        link.style.opacity = '0.5';
                    }
                });
            });
        }

        // Initialize
        buildFileTree(structure, fileTree);
    </script>
</body>
</html>`;
}

// Main execution
console.log('Scanning vault...');
const scannedStructure = scanDirectory(VAULT_ROOT);
structure.push(...scannedStructure);

console.log(`✓ Found ${Object.keys(notes).length} notes`);

console.log('Generating HTML...');
const html = generateHTML();
fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');

console.log(`✓ Generated ${OUTPUT_FILE}`);
console.log('✓ Wiki is ready! Open index.html in your browser.');


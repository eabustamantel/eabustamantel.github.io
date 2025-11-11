// Manejo del formulario de contacto
if (document.getElementById('contact-form')) {
    document.getElementById('contact-form').addEventListener('submit', function(event) {
        event.preventDefault(); // Prevenir el envío por defecto

        // Obtener valores del formulario
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const service = document.getElementById('service').value;
        const message = document.getElementById('message').value;

        // Simular envío (en un sitio real, aquí iría una llamada a API o envío por email)
        console.log('Consulta enviada:', { name, email, phone, service, message });

        // Mostrar alerta de confirmación
        alert(`¡Gracias ${name}! Tu consulta ha sido enviada. Te contactaremos pronto.`);

        // Limpiar el formulario
        document.getElementById('contact-form').reset();
    });
}

// Navegación suave para enlaces internos
if (document.querySelectorAll('a[href^="#"]').length > 0) {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Manejo del formulario de login
if (document.getElementById('login-form')) {
    document.getElementById('login-form').addEventListener('submit', function(event) {
        event.preventDefault(); // Prevenir el envío por defecto

        // Obtener valores del formulario
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // Verificar credenciales
        if (username === 'admin' && password === '123') {
            // Guardar sesión en localStorage
            localStorage.setItem('loggedIn', 'true');
            localStorage.setItem('userName', 'Juan Pérez');
            // Redirigir a admin.html
            window.location.href = 'admin.html';
        } else {
            alert('Credenciales incorrectas. Inténtalo de nuevo.');
        }
    });
}

// Función para mostrar secciones del admin
function showSection(sectionId) {
    const sections = document.querySelectorAll('.admin-section');
    sections.forEach(section => section.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');

    // Update sidebar active link
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    sidebarLinks.forEach(link => link.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-link[onclick*="${sectionId}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Scroll to the admin content to make the selected section visible
    document.getElementById('admin-content').scrollIntoView({ behavior: 'smooth' });
}

// Función para cerrar sesión
function logout() {
    localStorage.removeItem('loggedIn');
    localStorage.removeItem('userName');
    window.location.href = 'login.html';
}

// Datos simulados (en un sitio real, esto vendría de una API o base de datos)
let users = [
    { id: 1, name: 'Juan', apellido: 'Pérez', cedula: '1234567890', email: 'juan@example.com', role: 'Mecánico' },
    { id: 2, name: 'María', apellido: 'García', cedula: '0987654321', email: 'maria@example.com', role: 'Recepcionista' }
];

let cases = [
    { id: 1, caseNumber: 'C001', placa: 'ABC-123', marca: 'Toyota', modelo: 'Corolla', problema: 'Frenos', mecanico: 'Juan Pérez', estado: 'En Proceso' },
    { id: 2, caseNumber: 'C002', placa: 'DEF-456', marca: 'Honda', modelo: 'Civic', problema: 'Aceite', mecanico: 'Pedro López', estado: 'Finalizado' }
];

let inventory = [
    { id: 1, name: 'Filtro de aceite', stock: 50, price: 10.00, supplier: 'AutoParts Inc.' },
    { id: 2, name: 'Pastillas de freno', stock: 30, price: 25.00, supplier: 'BrakeMaster' }
];

let services = [
    { id: 1, vehicle: 'ABC-123', date: '2023-10-01', description: 'Cambio de aceite', cost: 40.00 },
    { id: 2, vehicle: 'DEF-456', date: '2023-10-05', description: 'Revisión de frenos', cost: 60.00 }
];

// Funciones para renderizar tablas
function renderUsers() {
    const tbody = document.querySelector('#users tbody');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.name}</td>
            <td>${user.apellido}</td>
            <td>${user.cedula}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>
                <button onclick="editUser(${user.id})">Editar</button>
                <button onclick="deleteUser(${user.id})">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

function renderCases() {
    const tbody = document.querySelector('#cases tbody');
    tbody.innerHTML = cases.map(caseItem => `
        <tr>
            <td>${caseItem.caseNumber}</td>
            <td>${caseItem.placa}</td>
            <td>${caseItem.marca} ${caseItem.modelo}</td>
            <td>${caseItem.problema}</td>
            <td>${caseItem.mecanico}</td>
            <td>${caseItem.estado}</td>
            <td>
                <button onclick="editCase(${caseItem.id})">Editar</button>
                <button onclick="deleteCase(${caseItem.id})">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

function renderInventory() {
    const tbody = document.querySelector('#inventory tbody');
    tbody.innerHTML = inventory.map(item => `
        <tr>
            <td>${item.name}</td>
            <td>${item.stock}</td>
            <td>$${item.price.toFixed(2)}</td>
            <td>${item.supplier}</td>
            <td>
                <button onclick="editInventory(${item.id})">Editar</button>
                <button onclick="deleteInventory(${item.id})">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

function renderServices() {
    const tbody = document.querySelector('#history tbody');
    tbody.innerHTML = services.map(service => `
        <tr>
            <td>${service.vehicle}</td>
            <td>${service.date}</td>
            <td>${service.description}</td>
            <td>$${service.cost.toFixed(2)}</td>
        </tr>
    `).join('');
}

function renderReports() {
    const totalCases = cases.length;
    const inProgress = cases.filter(c => c.estado === 'En Proceso').length;
    const finished = cases.filter(c => c.estado === 'Finalizado').length;
    const totalRevenue = services.reduce((sum, s) => sum + s.cost, 0);

    // Calculate vehicles finished per month (assuming current month)
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const finishedThisMonth = services.filter(s => {
        const serviceDate = new Date(s.date);
        return serviceDate.getMonth() === currentMonth && serviceDate.getFullYear() === currentYear;
    }).length;

    // Simulate customer satisfaction (random for demo)
    const satisfaction = Math.floor(Math.random() * 20) + 80; // 80-100%

    document.getElementById('reports').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${totalCases}</div>
                <div class="stat-label">Casos Totales</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${inProgress}</div>
                <div class="stat-label">En Progreso</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${finished}</div>
                <div class="stat-label">Finalizados</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${finishedThisMonth}</div>
                <div class="stat-label">Vehículos Finalizados Este Mes</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${satisfaction}%</div>
                <div class="stat-label">Satisfacción del Cliente</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">$${totalRevenue.toFixed(2)}</div>
                <div class="stat-label">Ingresos Totales</div>
            </div>
        </div>
    `;
}

// Funciones para agregar/editar/eliminar
function addUser() {
    const name = document.getElementById('user-name').value;
    const apellido = document.getElementById('user-apellido').value;
    const cedula = document.getElementById('user-cedula').value;
    const email = document.getElementById('user-email').value;
    const role = document.getElementById('user-role').value;

    if (name && apellido && cedula && email && role) {
        users.push({ id: Date.now(), name, apellido, cedula, email, role });
        renderUsers();
        document.getElementById('user-form').reset();
    }
}

function addCase() {
    const caseNumber = document.getElementById('case-number').value;
    const placa = document.getElementById('case-placa').value;
    const marca = document.getElementById('case-marca').value;
    const modelo = document.getElementById('case-modelo').value;
    const problema = document.getElementById('case-problema').value;
    const mecanico = document.getElementById('case-mecanico').value;
    const estado = document.getElementById('case-estado').value;

    if (caseNumber && placa && marca && modelo && problema && mecanico && estado) {
        cases.push({ id: Date.now(), caseNumber, placa, marca, modelo, problema, mecanico, estado });
        renderCases();
        document.getElementById('case-form').reset();
    }
}

function addInventory() {
    const name = document.getElementById('inv-name').value;
    const stock = document.getElementById('inv-stock').value;
    const price = document.getElementById('inv-price').value;
    const supplier = document.getElementById('inv-supplier').value;

    if (name && stock && price && supplier) {
        inventory.push({ id: Date.now(), name, stock: parseInt(stock), price: parseFloat(price), supplier });
        renderInventory();
        document.getElementById('inventory-form').reset();
    }
}

// Funciones de eliminación
function deleteUser(id) {
    users = users.filter(u => u.id !== id);
    renderUsers();
}

function deleteCase(id) {
    cases = cases.filter(c => c.id !== id);
    renderCases();
}

function deleteInventory(id) {
    inventory = inventory.filter(i => i.id !== id);
    renderInventory();
}

// Inicializar admin si estamos en admin.html
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('admin-content')) {
        // Verificar sesión
        if (localStorage.getItem('loggedIn') !== 'true') {
            window.location.href = 'login.html';
        } else {
            // Mostrar mensaje de bienvenida
            const userName = localStorage.getItem('userName');
            document.getElementById('welcome-message').textContent = `Bienvenido, ${userName}`;

            showSection('users');
            renderUsers();
            renderCases();
            renderInventory();
            renderServices();
            renderReports();
        }
    }
});

// Agregar clase 'active' al enlace de navegación basado en la sección visible
window.addEventListener('scroll', function() {
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.nav-links a');

    let current = '';

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (pageYOffset >= sectionTop - sectionHeight / 3) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').includes(current)) {
            link.classList.add('active');
        }
    });
});

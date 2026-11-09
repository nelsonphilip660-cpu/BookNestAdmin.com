/* =========================================
   BOOKNEST ADMIN DASHBOARD
========================================= */

// 1. SUPABASE CONNECTION
const SUPABASE_URL = "https://cvlotelnirlwhwcehgqt.supabase.co";

// Replace this with your actual sb_publishable_ key.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_dPKqtLiX2sEfFmIFAENI9w_TPgbDsEG";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

// 2. ELEMENTS
const $ = id => document.getElementById(id);

const loginScreen = $("loginScreen");
const dashboard = $("dashboard");
const loginForm = $("loginForm");
const loginMessage = $("loginMessage");
const notice = $("notice");

let currentBooks = [];
let currentOrders = [];
let currentSection = "overview";

// 3. HELPERS
function money(amount) {
  return "₦" + Number(amount || 0).toLocaleString("en-NG");
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showNotice(message, error = false) {
  notice.textContent = message;
  notice.classList.remove("hidden");
  notice.style.background = error ? "#fff0f0" : "#e8f8ef";
  notice.style.color = error ? "#b83240" : "#11724b";

  window.scrollTo({ top: 0, behavior: "smooth" });

  setTimeout(() => notice.classList.add("hidden"), 5000);
}

function showLogin(message = "") {
  dashboard.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginMessage.textContent = message;
}

function showDashboard() {
  loginScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
}

async function getSession() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  return data.session;
}

// 4. ADMINISTRATOR VERIFICATION
async function verifyAdministrator() {
  const session = await getSession();

  if (!session) {
    showLogin();
    return false;
  }

  const { data, error } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error || !data) {
    await db.auth.signOut();
    showLogin("This account is not authorized as a BookNest administrator.");
    return false;
  }

  return true;
}

// 5. LOGIN
loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("loginButton");
  button.disabled = true;
  button.textContent = "Signing in...";
  loginMessage.textContent = "";

  try {
    const email = $("adminEmail").value.trim();
    const password = $("adminPassword").value;

    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const allowed = await verifyAdministrator();

    if (allowed) {
      $("adminPassword").value = "";
      showDashboard();
      await loadDashboard();
    }

  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

// 6. LOGOUT
$("logoutButton").addEventListener("click", async () => {
  await db.auth.signOut();
  showLogin("You have signed out.");
});

// 7. NAVIGATION
const sectionTitles = {
  overview: "Overview",
  books: "Manage Books",
  addBook: "Upload Book",
  orders: "Customer Orders"
};

function openSection(section) {
  if (!sectionTitles[section]) return;

  currentSection = section;
  $("pageTitle").textContent = sectionTitles[section];

  document.querySelectorAll(".page-section").forEach(element => {
    element.classList.add("hidden");
  });

  $(section + "Section").classList.remove("hidden");

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === section
    );
  });

  if (section === "books") loadBooks();
  if (section === "orders") loadOrders();
}

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => {
    openSection(button.dataset.section);
  });
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => {
    openSection(button.dataset.go);
  });
});

// 8. DASHBOARD DATA
async function loadDashboard() {
  await Promise.all([
    loadBooks(),
    loadOrders()
  ]);

  openSection("overview");
}

// 9. LOAD BOOKS
async function loadBooks() {
  $("booksList").innerHTML =
    '<p class="empty-state">Loading books...</p>';

  const { data, error } = await db
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    $("booksList").textContent = error.message;
    return;
  }

  currentBooks = data || [];

  $("totalBooks").textContent = currentBooks.length;
  $("activeBooks").textContent =
    currentBooks.filter(book => book.is_active).length;

  renderBooks();
}

function renderBooks() {
  const search = $("bookSearch").value.toLowerCase();

  const filtered = currentBooks.filter(book =>
    `${book.title} ${book.author || ""} ${book.category}`
      .toLowerCase().includes(search)
  );

  if (!filtered.length) {
    $("booksList").innerHTML =
      '<p class="empty-state">No books found.</p>';
    return;
  }

  $("booksList").innerHTML = filtered.map(book => {
    const cover = book.cover_path
      ? db.storage.from("book-covers")
          .getPublicUrl(book.cover_path).data.publicUrl
      : "";

    return `
      <article class="book-row">
        <img src="${escapeHTML(cover)}"
             alt="${escapeHTML(book.title)}"
             onerror="this.style.display='none'">

        <div class="book-info">
          <h3>${escapeHTML(book.title)}</h3>
          <p>${escapeHTML(book.author || "Unknown author")}</p>
          <p>${escapeHTML(book.category)} · ${money(book.price_ngn)}</p>
          <p>${book.is_active ? "Active" : "Inactive"}</p>
        </div>

        <div class="book-actions">
          <button class="small-button"
            data-edit="${book.id}">Edit</button>

          <button class="small-button danger"
            data-toggle="${book.id}">
            ${book.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  $("booksList").querySelectorAll("[data-edit]").forEach(button => {
    button.addEventListener("click", () => {
      editBook(button.dataset.edit);
    });
  });

  $("booksList").querySelectorAll("[data-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      toggleBook(button.dataset.toggle);
    });
  });
}

$("bookSearch").addEventListener("input", renderBooks);

// 10. ADD BOOK
$("bookForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("saveBookButton");
  const message = $("bookMessage");
  const editingId = $("editingBookId").value;

  button.disabled = true;
  button.textContent = editingId ? "Saving changes..." : "Uploading...";
  message.textContent = "";

  try {
    const title = $("bookTitle").value.trim();
    const author = $("bookAuthor").value.trim();
    const description = $("bookDescription").value.trim();
    const category = $("bookCategory").value;
    const price = Number($("bookPrice").value);

    if (!title || !Number.isSafeInteger(price) || price < 0) {
      throw new Error("Enter a valid title and price.");
    }

    if (editingId) {
      // Edit existing book details without replacing its files.
      const { error } = await db
        .from("books")
        .update({
          title,
          author: author || null,
          description: description || null,
          category,
          price_ngn: price
        })
        .eq("id", editingId);

      if (error) throw error;

      message.textContent = "Book details updated successfully.";
      message.className = "message success";

    } else {
      const cover = $("bookCover").files[0];
      const pdf = $("bookPdf").files[0];

      if (!cover || !pdf) {
        throw new Error("Choose both a cover image and a PDF.");
      }

      const form = new FormData();
      form.append("title", title);
      form.append("author", author);
      form.append("description", description);
      form.append("category", category);
      form.append("price_ngn", String(price));
      form.append("cover", cover);
      form.append("pdf", pdf);

      const session = await getSession();

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-upload-book`,
        {
          method: "POST",
          headers: {
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${session.access_token}`
          },
          body: form
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Book upload failed.");
      }

      message.textContent = "Book uploaded successfully!";
      message.className = "message success";
    }

    $("bookForm").reset();
    $("editingBookId").value = "";
    $("bookFormTitle").textContent = "Upload a new book";
    $("saveBookButton").textContent = "Upload book";
    $("uploadFiles").classList.remove("hidden");
    $("cancelEditButton").classList.add("hidden");

    await loadBooks();

  } catch (error) {
    message.textContent = error.message;
    message.className = "message";
  } finally {
    button.disabled = false;

    if (!$("editingBookId").value) {
      button.textContent = "Upload book";
    } else {
      button.textContent = "Save changes";
    }
  }
});

// 11. EDIT BOOK
function editBook(id) {
  const book = currentBooks.find(item => item.id === id);
  if (!book) return;

  $("editingBookId").value = book.id;
  $("bookTitle").value = book.title;
  $("bookAuthor").value = book.author || "";
  $("bookDescription").value = book.description || "";
  $("bookCategory").value = book.category;
  $("bookPrice").value = book.price_ngn;

  $("bookFormTitle").textContent = "Edit book details";
  $("saveBookButton").textContent = "Save changes";
  $("uploadFiles").classList.add("hidden");
  $("cancelEditButton").classList.remove("hidden");

  openSection("addBook");
}

$("cancelEditButton").addEventListener("click", () => {
  $("bookForm").reset();
  $("editingBookId").value = "";
  $("bookFormTitle").textContent = "Upload a new book";
  $("saveBookButton").textContent = "Upload book";
  $("uploadFiles").classList.remove("hidden");
  $("cancelEditButton").classList.add("hidden");
});

// 12. ACTIVATE OR DEACTIVATE BOOK
async function toggleBook(id) {
  const book = currentBooks.find(item => item.id === id);
  if (!book) return;

  const action = book.is_active ? "deactivate" : "activate";

  if (!confirm(`Are you sure you want to ${action} "${book.title}"?`)) {
    return;
  }

  const { error } = await db
    .from("books")
    .update({ is_active: !book.is_active })
    .eq("id", id);

  if (error) {
    showNotice(error.message, true);
    return;
  }

  showNotice(`Book ${action}d successfully.`);
  await loadBooks();
}

// 13. LOAD ORDERS
async function loadOrders() {
  $("ordersList").innerHTML =
    '<p class="empty-state">Loading customer orders...</p>';

  $("recentOrders").innerHTML =
    '<p class="empty-state">Loading orders...</p>';

  const { data, error } = await db
    .from("orders")
    .select(`
      id,
      customer_name,
      customer_phone,
      customer_email,
      total_ngn,
      status,
      receipt_path,
      created_at,
      order_items (
        title_snapshot,
        quantity,
        unit_price_ngn
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    $("ordersList").textContent = error.message;
    $("recentOrders").textContent = error.message;
    return;
  }

  currentOrders = data || [];

  $("totalOrders").textContent = currentOrders.length;
  $("pendingOrders").textContent =
    currentOrders.filter(order => order.status === "pending").length;

  renderOrders();
  renderRecentOrders();
}

// 14. DISPLAY ORDERS
function orderItemsText(order) {
  return (order.order_items || []).map(item =>
    `${escapeHTML(item.title_snapshot)} × ${item.quantity}`
  ).join(", ") || "No item details";
}

function renderRecentOrders() {
  const recent = currentOrders.slice(0, 5);

  if (!recent.length) {
    $("recentOrders").innerHTML =
      '<p class="empty-state">No customer orders yet.</p>';
    return;
  }

  $("recentOrders").innerHTML = `
    <div class="orders-list">
      ${recent.map(order => `
        <div class="order-card">
          <div class="order-top">
            <h3>${escapeHTML(order.customer_name)}</h3>
            <span class="status ${escapeHTML(order.status)}">
              ${escapeHTML(order.status)}
            </span>
          </div>
          <p class="order-detail">
            ${money(order.total_ngn)} ·
            ${new Date(order.created_at).toLocaleString()}
          </p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderOrders() {
  const filter = $("orderFilter").value;

  const filtered = currentOrders.filter(order =>
    filter === "all" || order.status === filter
  );

  if (!filtered.length) {
    $("ordersList").innerHTML =
      '<p class="empty-state">No orders in this category.</p>';
    return;
  }

  $("ordersList").innerHTML = filtered.map(order => `
    <article class="order-card">
      <div class="order-top">
        <div>
          <h3>${escapeHTML(order.customer_name)}</h3>
          <p>Order: ${escapeHTML(order.id)}</p>
        </div>
        <span class="status ${escapeHTML(order.status)}">
          ${escapeHTML(order.status)}
        </span>
      </div>

      <p class="order-detail">
        WhatsApp/Phone: ${escapeHTML(order.customer_phone)}<br>
        Email: ${escapeHTML(order.customer_email || "Not provided")}<br>
        Date: ${new Date(order.created_at).toLocaleString()}<br>
        Books: ${orderItemsText(order)}<br>
        Total: <strong>${money(order.total_ngn)}</strong>
      </p>

      <div class="order-actions">
        ${order.receipt_path ? `
          <button class="small-button"
            data-receipt="${order.id}">
            View payment receipt
          </button>
        ` : `
          <span class="order-detail">No receipt submitted yet.</span>
        `}

        ${order.status === "pending" ? `
          <button class="small-button"
            data-approve="${order.id}">Approve payment</button>

          <button class="small-button danger"
            data-reject="${order.id}">Reject payment</button>
        ` : ""}
      </div>
    </article>
  `).join("");

  $("ordersList").querySelectorAll("[data-receipt]").forEach(button => {
    button.addEventListener("click", () => {
      viewReceipt(button.dataset.receipt);
    });
  });

  $("ordersList").querySelectorAll("[data-approve]").forEach(button => {
    button.addEventListener("click", () => {
      updateOrder(button.dataset.approve, "paid");
    });
  });

  $("ordersList").querySelectorAll("[data-reject]").forEach(button => {
    button.addEventListener("click", () => {
      updateOrder(button.dataset.reject, "rejected");
    });
  });
}

// 15. VIEW PRIVATE PAYMENT RECEIPT
async function viewReceipt(orderId) {
  const order = currentOrders.find(item => item.id === orderId);
  if (!order?.receipt_path) {
    showNotice("No receipt is attached to this order.", true);
    return;
  }

  const { data, error } = await db.storage
    .from("payment-receipts")
    .createSignedUrl(order.receipt_path, 300);

  if (error || !data?.signedUrl) {
    showNotice("Unable to open receipt. Check storage permissions.", true);
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

// 16. APPROVE OR REJECT PAYMENT
async function updateOrder(orderId, decision) {
  const action = decision === "paid" ? "approve" : "reject";

  if (!confirm(`Are you sure you want to ${action} this payment?`)) {
    return;
  }

  try {
    const session = await getSession();

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-update-order`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          order_id: orderId,
          decision
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Payment update failed.");
    }

    showNotice(result.message);
    await loadOrders();

  } catch (error) {
    showNotice(error.message, true);
  }
}

// 17. FILTER AND REFRESH ORDERS
$("orderFilter").addEventListener("change", renderOrders);

$("refreshOrders").addEventListener("click", loadOrders);

// 18. START DASHBOARD
async function startAdmin() {
  try {
    const allowed = await verifyAdministrator();

    if (allowed) {
      showDashboard();
      await loadDashboard();
    }
  } catch (error) {
    showLogin(error.message);
  }
}

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    showLogin();
  }
});

startAdmin();
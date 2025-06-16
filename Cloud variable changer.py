import ttkbootstrap as ttk
from ttkbootstrap.constants import END  # Import only what you use, e.g., END
from tkinter import messagebox
import scratchattach as sa

# Scratch login
user_ID = "##TOKEN USER ID HERE##"
session = sa.login_by_id(user_ID, username="TheCoolGuy99official")

cloud = None
last_value = None

# GUI Setup
root = ttk.Window(themename="darkly")  # Choose theme: 'cosmo', 'litera', 'darkly', etc.
root.title("Scratch Cloud Variable UI")
root.geometry("500x550")

# --- Widgets ---
ttk.Label(root, text="Project ID:", font=("Segoe UI", 11)).pack(pady=(10, 0))
project_entry = ttk.Entry(root, font=("Segoe UI", 11), width=40)
project_entry.insert(0, "1187682510")
project_entry.pack(pady=5)

ttk.Label(root, text="Cloud Variable Name:", font=("Segoe UI", 11)).pack()
variable_entry = ttk.Entry(root, font=("Segoe UI", 11), width=40)
variable_entry.insert(0, "☁ cloud2")
variable_entry.pack(pady=5)

ttk.Label(root, text="Value to Set:", font=("Segoe UI", 11)).pack()
value_entry = ttk.Entry(root, font=("Segoe UI", 11), width=40)
value_entry.pack(pady=5)

# Log Text Widget
log_text = ttk.Text(root, font=("Segoe UI", 10), height=12, width=58, wrap="word")
log_text.pack(pady=10)

# --- Functions ---
def connect_to_project():
    global cloud, last_value
    try:
        project_id = project_entry.get().strip()
        if not project_id.isdigit():
            raise ValueError("Project ID must be a number.")
        cloud = session.connect_cloud(project_id)
        last_value = None
        log_text.insert(END, f"✅ Connected to project {project_id}\n")
        log_text.see(END)
    except Exception as e:
        messagebox.showerror("Error", f"Failed to connect: {e}")

def poll_cloud_variable():
    global last_value
    var_name = variable_entry.get().strip()
    if not var_name or cloud is None:
        root.after(1000, poll_cloud_variable)
        return
    try:
        value = cloud.get_var(var_name)
        if value != last_value:
            log_text.insert(END, f"🔄 {var_name}: {value}\n")
            log_text.see(END)
            last_value = value
    except Exception as e:
        log_text.insert(END, f"⚠️ Error reading variable: {e}\n")
        log_text.see(END)
    root.after(1000, poll_cloud_variable)

import http.server
import socketserver
import os
import sys
import webbrowser
import threading
import time

def check_python():
    """Check if Python is available"""
    try:
        import sys
        print(f"Python {sys.version} обнаружен")
        return True
    except Exception as e:
        print(f"Ошибка при проверке Python: {e}")
        return False

def start_server(port=8000):
    """Start the HTTP server"""
    handler = http.server.SimpleHTTPRequestHandler
    try:
        with socketserver.TCPServer(("", port), handler) as httpd:
            print(f"Сервер запущен на порту {port}")
            print(f"Откройте браузер и перейдите по адресу: http://localhost:{port}")
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"Порт {port} занят. Пробуем порт {port + 1}")
            start_server(port + 1)
        else:
            raise e

def open_browser(port=8000):
    """Open the default browser after a short delay"""
    time.sleep(1)  # Wait for server to start
    webbrowser.open(f"http://localhost:{port}/index.html")

if __name__ == "__main__":
    print("Видеоплеер с автопропуском")
    print("===========================")
    
    # Check if Python is available
    if not check_python():
        print("Ошибка: Python не найден. Убедитесь, что Python установлен в системе.")
        input("Нажмите Enter для выхода...")
        sys.exit(1)
    
    # Check if index.html exists
    if not os.path.exists("index.html"):
        print("Ошибка: index.html не найден в текущей директории.")
        input("Нажмите Enter для выхода...")
        sys.exit(1)
    
    # Set port (default 8000)
    port = 8000
    
    # Start server in a separate thread
    server_thread = threading.Thread(target=start_server, args=(port,))
    server_thread.daemon = True
    server_thread.start()
    
    # Open browser
    open_browser(port)
    
    # Keep the main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
        sys.exit(0)
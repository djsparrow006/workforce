from backend.app import create_app
app = create_app()
print('App Instance path:', app.instance_path)

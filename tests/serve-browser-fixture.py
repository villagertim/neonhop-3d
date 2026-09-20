"""Serve the app for browser smoke tests without loading any provider credentials."""
from test_gateway import gateway

if __name__ == '__main__':
    server = gateway.create_server(0)
    print(f'TEST_URL=http://127.0.0.1:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

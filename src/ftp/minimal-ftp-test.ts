/**
 * Minimal FTP Server - Start Small and Verify Each Step
 * 
 * Step 1: Just handle USER/PASS/PWD/QUIT - prove basic command parsing works
 */

import * as net from 'net';

interface Connection {
    socket: net.Socket;
    id: string;
    username?: string;
    authenticated: boolean;
    currentPath: string;
    dataServer?: net.Server;
    dataPort?: number;
    dataSocket?: net.Socket;
}

class MinimalFtpServer {
    private server: net.Server;
    private connections = new Map<string, Connection>();
    
    constructor(private port: number = 2123) {
        this.server = net.createServer(this.handleConnection.bind(this));
    }
    
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, '127.0.0.1', () => {
                console.log(`🎯 MINIMAL FTP server on 127.0.0.1:${this.port}`);
                console.log(`🎯 Test: lftp -u "test,test" localhost:${this.port}`);
                resolve();
            });
            this.server.on('error', reject);
        });
    }
    
    private handleConnection(socket: net.Socket): void {
        const id = `min-${Date.now()}`;
        console.log(`🎯 [${id}] NEW CONNECTION`);
        
        const connection: Connection = {
            socket,
            id,
            authenticated: false,
            currentPath: '/'
        };
        
        this.connections.set(id, connection);
        
        socket.setEncoding('utf8');
        socket.on('data', (data: Buffer) => this.handleData(connection, data.toString()));
        socket.on('close', () => console.log(`🎯 [${id}] CLOSED`));
        socket.on('error', (e) => console.log(`🎯 [${id}] ERROR:`, e.message));
        
        // Send welcome
        this.send(connection, 220, 'MINIMAL FTP READY');
    }
    
    private async handleData(conn: Connection, data: string): Promise<void> {
        console.log(`🎯 [${conn.id}] RAW DATA: "${data.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
        
        const lines = data.trim().split('\r\n').filter(line => line.length > 0);
        console.log(`🎯 [${conn.id}] PARSED LINES: ${lines.length}`);
        
        for (const line of lines) {
            console.log(`🎯 [${conn.id}] PROCESSING: "${line}"`);
            const [cmd, ...args] = line.trim().split(' ');
            await this.processCommand(conn, cmd.toUpperCase(), args.join(' '));
        }
    }
    
    private async processCommand(conn: Connection, cmd: string, args: string): Promise<void> {
        console.log(`🎯 [${conn.id}] COMMAND: ${cmd} ARGS: "${args}"`);
        
        switch (cmd) {
            case 'USER':
                conn.username = args;
                console.log(`🎯 [${conn.id}] USERNAME SET: ${args}`);
                this.send(conn, 331, 'Need password');
                break;
                
            case 'PASS':
                conn.authenticated = true;
                console.log(`🎯 [${conn.id}] AUTHENTICATED`);
                this.send(conn, 230, 'Logged in');
                break;
                
            case 'PWD':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                console.log(`🎯 [${conn.id}] PWD REQUEST - current: ${conn.currentPath}`);
                this.send(conn, 257, `"${conn.currentPath}" is current directory`);
                break;
                
            case 'CWD':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                const newPath = this.resolvePath(conn.currentPath, args);
                conn.currentPath = newPath;
                console.log(`🎯 [${conn.id}] CWD: "${args}" -> "${newPath}"`);
                this.send(conn, 250, `Directory changed to ${newPath}`);
                break;
                
            case 'PASV':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                await this.handlePasv(conn);
                break;
                
            case 'CDUP':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                conn.currentPath = this.resolvePath(conn.currentPath, '..');
                console.log(`🎯 [${conn.id}] CDUP: Parent -> "${conn.currentPath}"`);
                this.send(conn, 250, `Directory changed to ${conn.currentPath}`);
                break;
                
            case 'LIST':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                await this.handleList(conn);
                break;
                
            case 'QUIT':
                console.log(`🎯 [${conn.id}] QUIT REQUEST`);
                this.send(conn, 221, 'Goodbye');
                conn.socket.destroy();
                break;
                
            case 'SYST':
                this.send(conn, 215, 'UNIX Type: L8');
                break;
                
            case 'TYPE':
                this.send(conn, 200, 'Type set');
                break;
                
            case 'FEAT':
                this.send(conn, 211, 'No features');
                break;
                
            default:
                console.log(`🎯 [${conn.id}] UNKNOWN COMMAND: ${cmd}`);
                this.send(conn, 502, `${cmd} not implemented`);
                break;
        }
    }
    
    private send(conn: Connection, code: number, msg: string): void {
        const response = `${code} ${msg}\r\n`;
        conn.socket.write(response);
        console.log(`🎯 [${conn.id}] SENT: ${code} ${msg}`);
    }
    
    private resolvePath(currentPath: string, relativePath: string): string {
        if (relativePath.startsWith('/')) {
            return relativePath;
        }
        
        const parts = currentPath.split('/').filter(p => p.length > 0);
        const relativeParts = relativePath.split('/').filter(p => p.length > 0);
        
        for (const part of relativeParts) {
            if (part === '..') {
                parts.pop();
            } else if (part !== '.') {
                parts.push(part);
            }
        }
        
        return '/' + parts.join('/');
    }
    
    private async handlePasv(conn: Connection): Promise<void> {
        console.log(`🎯 [${conn.id}] PASV: Creating data server...`);
        
        // Close existing data server if any
        if (conn.dataServer) {
            conn.dataServer.close();
        }
        
        // Create new data server
        const dataServer = net.createServer();
        
        return new Promise((resolve, reject) => {
            dataServer.listen(0, '127.0.0.1', () => {
                const address = dataServer.address() as net.AddressInfo;
                const port = address.port;
                
                conn.dataServer = dataServer;
                conn.dataPort = port;
                
                console.log(`🎯 [${conn.id}] PASV: Data server listening on 127.0.0.1:${port}`);
                
                // Calculate PASV response bytes
                const p1 = Math.floor(port / 256);
                const p2 = port % 256;
                
                this.send(conn, 227, `Entering passive mode (127,0,0,1,${p1},${p2})`);
                console.log(`🎯 [${conn.id}] PASV: Sent response with port ${port} (${p1},${p2})`);
                
                resolve();
            });
            
            dataServer.on('error', (error) => {
                console.error(`🎯 [${conn.id}] PASV: Data server error:`, error);
                reject(error);
            });
            
            dataServer.on('connection', (dataSocket) => {
                console.log(`🎯 [${conn.id}] PASV: DATA CONNECTION RECEIVED!`);
                conn.dataSocket = dataSocket;
                dataSocket.on('close', () => {
                    console.log(`🎯 [${conn.id}] PASV: Data connection closed`);
                    conn.dataSocket = undefined;
                });
            });
        });
    }
    
    private async handleList(conn: Connection): Promise<void> {
        console.log(`🎯 [${conn.id}] LIST: Starting directory listing`);
        
        if (!conn.dataSocket) {
            console.log(`🎯 [${conn.id}] LIST: No data connection - need PASV first`);
            this.send(conn, 425, 'Use PASV first');
            return;
        }
        
        // Generate fake directory listing
        const listing = [
            'drwxr-xr-x 1 user group        0 Jan 01 12:00 documents',
            'drwxr-xr-x 1 user group        0 Jan 01 12:00 images', 
            '-rw-r--r-- 1 user group      123 Jan 01 12:00 readme.txt',
            '-rw-r--r-- 1 user group      456 Jan 01 12:00 config.json'
        ].join('\r\n') + '\r\n';
        
        console.log(`🎯 [${conn.id}] LIST: Generated listing (${listing.length} bytes)`);
        
        try {
            this.send(conn, 150, 'Opening data connection');
            console.log(`🎯 [${conn.id}] LIST: Sending data`);
            conn.dataSocket.write(listing);
            conn.dataSocket.end();
            this.send(conn, 226, 'Directory listing completed');
            console.log(`🎯 [${conn.id}] LIST: Completed successfully`);
        } catch (error) {
            console.error(`🎯 [${conn.id}] LIST: Error -`, error);
            this.send(conn, 550, 'Directory listing failed');
        }
    }
}

// Start server with port from command line argument
const port = process.argv[2] ? parseInt(process.argv[2]) : 2124;
const server = new MinimalFtpServer(port);
server.start().then(() => {
    console.log(`🎯 MINIMAL SERVER READY on port ${port} - Test basic commands first`);
}).catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    process.exit(0);
});
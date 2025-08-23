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
                
            case 'EPSV':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                await this.handleEpsv(conn);
                break;
                
            case 'LIST':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                await this.handleList(conn);
                break;
                
            case 'RETR':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                await this.handleRetr(conn, args);
                break;
                
            case 'STOR':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                await this.handleStor(conn, args);
                break;
                
            case 'SIZE':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                this.handleSize(conn, args);
                break;
                
            case 'MDTM':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                this.handleMdtm(conn, args);
                break;
                
            case 'MKD':
            case 'XMKD':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                this.handleMkd(conn, args);
                break;
                
            case 'RMD':
            case 'XRMD':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                this.handleRmd(conn, args);
                break;
                
            case 'DELE':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                this.handleDele(conn, args);
                break;
                
            case 'CDUP':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                conn.currentPath = this.resolvePath(conn.currentPath, '..');
                console.log(`🎯 [${conn.id}] CDUP: Changed to parent: ${conn.currentPath}`);
                this.send(conn, 250, `Directory changed to ${conn.currentPath}`);
                break;
                
            case 'NLST':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                await this.handleNlst(conn, args);
                break;
                
            case 'NOOP':
                this.send(conn, 200, 'NOOP command successful');
                break;
                
            case 'ABOR':
                console.log(`🎯 [${conn.id}] ABOR: Abort request`);
                this.send(conn, 226, 'No transfer to abort');
                break;
                
            case 'STAT':
                this.handleStat(conn, args);
                break;
                
            case 'MODE':
                console.log(`🎯 [${conn.id}] MODE: ${args}`);
                this.send(conn, 200, 'Mode set to Stream');
                break;
                
            case 'STRU':
                console.log(`🎯 [${conn.id}] STRU: ${args}`);
                this.send(conn, 200, 'Structure set to File');
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
                
            case 'SIZE':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                const fakeSize = Math.floor(Math.random() * 10000) + 100;
                console.log(`🎯 [${conn.id}] SIZE: "${args}" -> ${fakeSize} bytes`);
                this.send(conn, 213, fakeSize.toString());
                break;
                
            case 'MDTM':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                const now = new Date();
                const timestamp = now.getFullYear().toString() +
                               (now.getMonth() + 1).toString().padStart(2, '0') +
                               now.getDate().toString().padStart(2, '0') +
                               now.getHours().toString().padStart(2, '0') +
                               now.getMinutes().toString().padStart(2, '0') +
                               now.getSeconds().toString().padStart(2, '0');
                console.log(`🎯 [${conn.id}] MDTM: "${args}" -> ${timestamp}`);
                this.send(conn, 213, timestamp);
                break;
                
            case 'MKD':
            case 'XMKD':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                const newDir = this.resolvePath(conn.currentPath, args);
                console.log(`🎯 [${conn.id}] MKD: Create "${args}" -> "${newDir}"`);
                this.send(conn, 257, `"${newDir}" directory created`);
                break;
                
            case 'RMD':
            case 'XRMD':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                console.log(`🎯 [${conn.id}] RMD: Remove "${args}"`);
                this.send(conn, 250, 'Directory removed');
                break;
                
            case 'DELE':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                console.log(`🎯 [${conn.id}] DELE: Delete "${args}"`);
                this.send(conn, 250, 'File deleted');
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
                
            case 'NLST':
                if (!conn.authenticated) {
                    this.send(conn, 530, 'Not logged in');
                    return;
                }
                await this.handleNlst(conn, args);
                break;
                
            case 'NOOP':
                console.log(`🎯 [${conn.id}] NOOP: Keep alive`);
                this.send(conn, 200, 'NOOP command successful');
                break;
                
            case 'ABOR':
                console.log(`🎯 [${conn.id}] ABOR: Abort request`);
                this.send(conn, 226, 'No transfer to abort');
                break;
                
            case 'STAT':
                if (args) {
                    console.log(`🎯 [${conn.id}] STAT: File status for "${args}"`);
                    this.send(conn, 213, `Status of ${args}: -rw-r--r-- 1 user group 1234 Jan 01 12:00 ${args}`);
                } else {
                    console.log(`🎯 [${conn.id}] STAT: Server status`);
                    this.send(conn, 211, 'Server status: Ready');
                }
                break;
                
            case 'MODE':
                console.log(`🎯 [${conn.id}] MODE: "${args}"`);
                this.send(conn, 200, 'Mode set to Stream');
                break;
                
            case 'STRU':
                console.log(`🎯 [${conn.id}] STRU: "${args}"`);
                this.send(conn, 200, 'Structure set to File');
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
        
        if (!conn.dataServer || !conn.dataPort) {
            console.log(`🎯 [${conn.id}] LIST: No data connection - need PASV first`);
            this.send(conn, 425, 'Use PASV first');
            return;
        }
        
        // Generate simple fake directory listing
        const listing = [
            'drwxr-xr-x 1 user group        0 Jan 01 12:00 documents',
            'drwxr-xr-x 1 user group        0 Jan 01 12:00 images', 
            '-rw-r--r-- 1 user group      123 Jan 01 12:00 readme.txt',
            '-rw-r--r-- 1 user group      456 Jan 01 12:00 config.json'
        ].join('\r\n') + '\r\n';
        
        console.log(`🎯 [${conn.id}] LIST: Generated listing (${listing.length} bytes)`);
        
        try {
            this.send(conn, 150, 'Opening data connection');
            console.log(`🎯 [${conn.id}] LIST: Waiting for data connection...`);
            
            // Wait for data connection with shorter timeout
            const dataSocket = await this.waitForDataConnection(conn);
            
            console.log(`🎯 [${conn.id}] LIST: Data connection ready, sending listing`);
            dataSocket.write(listing);
            dataSocket.end();
            
            this.send(conn, 226, 'Directory listing completed');
            console.log(`🎯 [${conn.id}] LIST: Successfully completed`);
            
        } catch (error) {
            console.error(`🎯 [${conn.id}] LIST: Error -`, error);
            this.send(conn, 550, 'Directory listing failed');
        }
    }
    
    private async waitForDataConnection(conn: Connection): Promise<net.Socket> {
        // Check if data socket already exists (connected during PASV)
        if (conn.dataSocket) {
            console.log(`🎯 [${conn.id}] WAIT: Using existing data connection`);
            return conn.dataSocket;
        }
        
        // Otherwise wait for new connection
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Data connection timeout'));
            }, 2000);
            
            if (conn.dataServer) {
                conn.dataServer.once('connection', (socket) => {
                    clearTimeout(timeout);
                    console.log(`🎯 [${conn.id}] WAIT: New data connection established`);
                    resolve(socket);
                });
            } else {
                clearTimeout(timeout);
                reject(new Error('No data server'));
            }
        });
    }
    
    private async handleRetr(conn: Connection, filename: string): Promise<void> {
        console.log(`🎯 [${conn.id}] RETR: Download request for "${filename}"`);
        
        if (!conn.dataSocket) {
            this.send(conn, 425, 'Use PASV first');
            return;
        }
        
        // Generate fake file content
        const content = `Fake content for ${filename}\nGenerated at: ${new Date().toISOString()}\nRandom: ${Math.random()}`;
        
        try {
            this.send(conn, 150, `Opening data connection for ${filename}`);
            conn.dataSocket.write(content);
            conn.dataSocket.end();
            this.send(conn, 226, 'Transfer complete');
            console.log(`🎯 [${conn.id}] RETR: Successfully sent ${content.length} bytes`);
        } catch (error) {
            console.error(`🎯 [${conn.id}] RETR: Error -`, error);
            this.send(conn, 550, 'File transfer failed');
        }
    }
    
    private async handleStor(conn: Connection, filename: string): Promise<void> {
        console.log(`🎯 [${conn.id}] STOR: Upload request for "${filename}"`);
        
        if (!conn.dataSocket) {
            this.send(conn, 425, 'Use PASV first');
            return;
        }
        
        try {
            this.send(conn, 150, `Opening data connection for ${filename}`);
            
            let content = '';
            conn.dataSocket.on('data', (chunk: Buffer) => {
                content += chunk.toString();
            });
            
            conn.dataSocket.on('end', () => {
                console.log(`🎯 [${conn.id}] STOR: Received ${content.length} bytes for "${filename}"`);
                this.send(conn, 226, 'Transfer complete');
            });
            
        } catch (error) {
            console.error(`🎯 [${conn.id}] STOR: Error -`, error);
            this.send(conn, 550, 'File upload failed');
        }
    }
    
    private handleSize(conn: Connection, filename: string): void {
        console.log(`🎯 [${conn.id}] SIZE: Request for "${filename}"`);
        // Return fake file size
        const fakeSize = Math.floor(Math.random() * 10000) + 100;
        this.send(conn, 213, fakeSize.toString());
    }
    
    private handleMdtm(conn: Connection, filename: string): void {
        console.log(`🎯 [${conn.id}] MDTM: Request for "${filename}"`);
        // Return fake modification time (YYYYMMDDHHMMSS format)
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
                         (now.getMonth() + 1).toString().padStart(2, '0') +
                         now.getDate().toString().padStart(2, '0') +
                         now.getHours().toString().padStart(2, '0') +
                         now.getMinutes().toString().padStart(2, '0') +
                         now.getSeconds().toString().padStart(2, '0');
        this.send(conn, 213, timestamp);
    }
    
    private handleMkd(conn: Connection, dirname: string): void {
        console.log(`🎯 [${conn.id}] MKD: Create directory "${dirname}"`);
        const newPath = this.resolvePath(conn.currentPath, dirname);
        this.send(conn, 257, `"${newPath}" directory created`);
    }
    
    private handleRmd(conn: Connection, dirname: string): void {
        console.log(`🎯 [${conn.id}] RMD: Remove directory "${dirname}"`);
        this.send(conn, 250, 'Directory removed');
    }
    
    private handleDele(conn: Connection, filename: string): void {
        console.log(`🎯 [${conn.id}] DELE: Delete file "${filename}"`);
        this.send(conn, 250, 'File deleted');
    }
    
    private async handleNlst(conn: Connection, path?: string): Promise<void> {
        console.log(`🎯 [${conn.id}] NLST: Name list for "${path || conn.currentPath}"`);
        
        if (!conn.dataSocket) {
            this.send(conn, 425, 'Use PASV first');
            return;
        }
        
        // Simple name listing (just filenames, no details)
        const names = ['documents', 'images', 'readme.txt', 'config.json'].join('\r\n') + '\r\n';
        
        try {
            this.send(conn, 150, 'Opening data connection');
            conn.dataSocket.write(names);
            conn.dataSocket.end();
            this.send(conn, 226, 'Name listing completed');
            console.log(`🎯 [${conn.id}] NLST: Sent ${names.length} bytes`);
        } catch (error) {
            console.error(`🎯 [${conn.id}] NLST: Error -`, error);
            this.send(conn, 550, 'Name listing failed');
        }
    }
    
    private handleStat(conn: Connection, path?: string): void {
        console.log(`🎯 [${conn.id}] STAT: Status request for "${path || 'server'}"`);
        
        if (path) {
            // File/directory status
            this.send(conn, 213, `Status of ${path}: -rw-r--r-- 1 user group 1234 Jan 01 12:00 ${path}`);
        } else {
            // Server status
            this.send(conn, 211, 'Server status: Ready');
        }
    }
    
    private async handleEpsv(conn: Connection): Promise<void> {
        console.log(`🎯 [${conn.id}] EPSV: Creating extended passive data server...`);
        
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
                
                console.log(`🎯 [${conn.id}] EPSV: Data server listening on 127.0.0.1:${port}`);
                
                // EPSV response format: |||port|
                this.send(conn, 229, `Entering extended passive mode (|||${port}|)`);
                console.log(`🎯 [${conn.id}] EPSV: Sent response with port ${port}`);
                
                resolve();
            });
            
            dataServer.on('error', (error) => {
                console.error(`🎯 [${conn.id}] EPSV: Data server error:`, error);
                reject(error);
            });
            
            dataServer.on('connection', (dataSocket) => {
                console.log(`🎯 [${conn.id}] EPSV: DATA CONNECTION RECEIVED!`);
                conn.dataSocket = dataSocket;
                dataSocket.on('close', () => {
                    console.log(`🎯 [${conn.id}] EPSV: Data connection closed`);
                    conn.dataSocket = undefined;
                });
            });
        });
    }
    
    private async handleRetr(conn: Connection, filename: string): Promise<void> {
        console.log(`🎯 [${conn.id}] RETR: Download "${filename}"`);
        
        if (!conn.dataSocket) {
            console.log(`🎯 [${conn.id}] RETR: No data connection`);
            this.send(conn, 425, 'Use PASV first');
            return;
        }
        
        const content = `Fake content for ${filename}\nGenerated at: ${new Date().toISOString()}\nRandom: ${Math.random()}`;
        
        try {
            this.send(conn, 150, `Opening data connection for ${filename}`);
            console.log(`🎯 [${conn.id}] RETR: Sending ${content.length} bytes`);
            conn.dataSocket.write(content);
            conn.dataSocket.end();
            this.send(conn, 226, 'Transfer complete');
            console.log(`🎯 [${conn.id}] RETR: Successfully completed`);
        } catch (error) {
            console.error(`🎯 [${conn.id}] RETR: Error -`, error);
            this.send(conn, 550, 'File transfer failed');
        }
    }
    
    private async handleStor(conn: Connection, filename: string): Promise<void> {
        console.log(`🎯 [${conn.id}] STOR: Upload "${filename}"`);
        
        if (!conn.dataSocket) {
            console.log(`🎯 [${conn.id}] STOR: No data connection`);
            this.send(conn, 425, 'Use PASV first');
            return;
        }
        
        try {
            this.send(conn, 150, `Opening data connection for ${filename}`);
            console.log(`🎯 [${conn.id}] STOR: Ready to receive data`);
            
            let content = '';
            conn.dataSocket.on('data', (chunk: Buffer) => {
                content += chunk.toString();
                console.log(`🎯 [${conn.id}] STOR: Received ${chunk.length} bytes`);
            });
            
            conn.dataSocket.on('end', () => {
                console.log(`🎯 [${conn.id}] STOR: Upload complete - ${content.length} total bytes`);
                this.send(conn, 226, 'Transfer complete');
            });
            
        } catch (error) {
            console.error(`🎯 [${conn.id}] STOR: Error -`, error);
            this.send(conn, 550, 'File upload failed');
        }
    }
    
    private async handleNlst(conn: Connection, path?: string): Promise<void> {
        console.log(`🎯 [${conn.id}] NLST: Name list for "${path || conn.currentPath}"`);
        
        if (!conn.dataSocket) {
            console.log(`🎯 [${conn.id}] NLST: No data connection`);
            this.send(conn, 425, 'Use PASV first');
            return;
        }
        
        const names = ['documents', 'images', 'readme.txt', 'config.json'].join('\r\n') + '\r\n';
        
        try {
            this.send(conn, 150, 'Opening data connection');
            console.log(`🎯 [${conn.id}] NLST: Sending ${names.length} bytes`);
            conn.dataSocket.write(names);
            conn.dataSocket.end();
            this.send(conn, 226, 'Name listing completed');
            console.log(`🎯 [${conn.id}] NLST: Successfully completed`);
        } catch (error) {
            console.error(`🎯 [${conn.id}] NLST: Error -`, error);
            this.send(conn, 550, 'Name listing failed');
        }
    }
}

// Start server with port from command line argument

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
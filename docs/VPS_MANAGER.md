# Linux and Windows server management

In VPS Manager, choose **Add Server**, select the operating system, enter the SSH host and port, and choose password, private key, or local SSH agent authentication. **Test connection** checks authentication and the selected shell before saving. Existing profiles continue to use Linux.

## Windows Server

Windows connections use OpenSSH and Windows PowerShell 5.1 or later. They do not open an RDP desktop or use WinRM. Enable OpenSSH Server, start the `sshd` service, and allow the configured SSH port through the server and provider firewalls. The default SSH port is 22; port 3389 is for Remote Desktop.

See Microsoft's [OpenSSH Server setup guide](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse) for installation and authentication requirements.

Select **Windows Server** and enter a local or domain account, such as `Administrator` or `DOMAIN\user`. PowerShell commands are explicitly invoked, so changing the OpenSSH default shell is unnecessary.

- Terminal commands use PowerShell syntax. Each command starts a fresh process; include a location change in the same command when needed, for example `Set-Location 'D:/apps/api'; Get-ChildItem`.
- Metrics show CPU, memory, system-drive usage and uptime. Linux load average is not shown for Windows.
- Files start at `C:/`. Enter another path, such as `D:/apps`, in the directory field and press Enter. File editing is intended for UTF-8 text files.
- Environment-file saves first create a timestamped backup. Backup or write failures are reported to the user.
- PM2 and deployments require Git, Node.js/npm and PM2 installed and available in the SSH account's PATH. Use PowerShell-compatible install/build commands; Windows PowerShell 5.1 does not support `&&`.

## Finding and managing servers

Search by name, host, username or operating system. Combine OS and connection-status filters to find servers that need attention. Select a server name to inspect its workspace even when disconnected. Only live sessions are shown as connected after an app restart.

## Validation

Automated coverage includes command encoding, Unicode content, literal path quoting, Linux shell round trips, Windows directory responses, metrics, failed writes/backups, and deployment failure handling. Live Windows authentication, permissions and installed tools must be checked against the target server.

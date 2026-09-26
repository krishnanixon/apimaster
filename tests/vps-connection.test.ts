import { describe, expect, it } from 'vitest'
import {
  detectSshKeyFormat,
  isLikelySshKeyFileName,
  looksLikeVpsTarget,
  parseVpsTarget,
  sshKeyFormatLabel,
  sshKeyTypeLabel
} from '@shared/lib/vps-connection'

describe('parseVpsTarget', () => {
  it('parses user@host', () => {
    expect(parseVpsTarget('ubuntu@192.168.1.10')).toEqual({
      host: '192.168.1.10',
      username: 'ubuntu'
    })
  })

  it('parses user@host:port', () => {
    expect(parseVpsTarget('root@example.com:2222')).toEqual({
      host: 'example.com',
      port: 2222,
      username: 'root'
    })
  })

  it('parses ssh:// URLs', () => {
    expect(parseVpsTarget('ssh://deploy@api.example.com:22')).toEqual({
      host: 'api.example.com',
      port: 22,
      username: 'deploy'
    })
  })

  it('parses bracketed IPv6 with user', () => {
    expect(parseVpsTarget('ubuntu@[2001:db8::1]:22')).toEqual({
      host: '2001:db8::1',
      port: 22,
      username: 'ubuntu'
    })
  })

  it('returns a plain host as-is', () => {
    expect(parseVpsTarget('  10.0.0.5  ')).toEqual({ host: '10.0.0.5' })
  })

  it('returns null for empty input', () => {
    expect(parseVpsTarget('   ')).toBeNull()
  })
})

describe('looksLikeVpsTarget', () => {
  it('detects SSH user@host and URLs', () => {
    expect(looksLikeVpsTarget('ubuntu@ec2.amazonaws.com')).toBe(true)
    expect(looksLikeVpsTarget('ssh://root@host')).toBe(true)
    expect(looksLikeVpsTarget('api.example.com')).toBe(false)
  })
})

describe('detectSshKeyFormat', () => {
  it('detects PEM, OpenSSH, PKCS#8, PPK, and public keys', () => {
    expect(detectSshKeyFormat('-----BEGIN RSA PRIVATE KEY-----\nMII\n-----END RSA PRIVATE KEY-----')).toBe(
      'pem'
    )
    expect(detectSshKeyFormat('-----BEGIN OPENSSH PRIVATE KEY-----\nb3Blbn\n-----END OPENSSH PRIVATE KEY-----')).toBe(
      'openssh'
    )
    expect(detectSshKeyFormat('-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----')).toBe('pkcs8')
    expect(detectSshKeyFormat('PuTTY-User-Key-File-2: ssh-rsa\nEncryption: none\n')).toBe('ppk')
    expect(detectSshKeyFormat('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI comment')).toBe('public')
    expect(detectSshKeyFormat('not a key')).toBe('unknown')
  })

  it('strips a UTF-8 BOM before detecting', () => {
    expect(detectSshKeyFormat('\uFEFF-----BEGIN RSA PRIVATE KEY-----\nMII')).toBe('pem')
  })
})

describe('ssh key labels and filenames', () => {
  it('labels common formats and algorithms', () => {
    expect(sshKeyFormatLabel('pem')).toBe('PEM')
    expect(sshKeyFormatLabel('ppk')).toBe('PuTTY')
    expect(sshKeyTypeLabel('ssh-ed25519')).toBe('ED25519')
    expect(sshKeyTypeLabel('ssh-rsa')).toBe('RSA')
    expect(sshKeyTypeLabel('ecdsa-sha2-nistp256')).toBe('ECDSA')
  })

  it('recognizes typical private-key filenames', () => {
    expect(isLikelySshKeyFileName('lightsail.pem')).toBe(true)
    expect(isLikelySshKeyFileName('server.ppk')).toBe(true)
    expect(isLikelySshKeyFileName('id_ed25519')).toBe(true)
    expect(isLikelySshKeyFileName('id_rsa.pub')).toBe(true)
    expect(isLikelySshKeyFileName('notes.txt')).toBe(false)
  })
})

//! Cutloupe ledger: a hash-chained edit history per reel, plus a global,
//! hash-addressed seal for every exported file.
//!
//! A reel's `head` is the hash of its latest committed timeline. Each cut must
//! name the head it builds on, so two writers racing on the same reel cannot
//! both land: the loser gets `StaleHead`. An export seal may only point at the
//! current head, so every sealed file traces back to a committed version.

use anchor_lang::prelude::*;

declare_id!("G6kWfHR1X2tHFgwHvrc5soiXwUF4bYXprv7YMTJnx5eY");

pub const ACTOR_HUMAN: u8 = 0;
pub const ACTOR_AGENT: u8 = 1;
pub const ACTOR_MIXED: u8 = 2;

pub const FLAG_AI_EDITED: u8 = 1 << 0;
pub const FLAG_AI_GENERATED_MEDIA: u8 = 1 << 1;
pub const FLAG_SYNTHETIC_VOICE: u8 = 1 << 2;
pub const FLAG_LICENSED_MUSIC: u8 = 1 << 3;
pub const FLAG_MASK: u8 =
    FLAG_AI_EDITED | FLAG_AI_GENERATED_MEDIA | FLAG_SYNTHETIC_VOICE | FLAG_LICENSED_MUSIC;

const ZERO: [u8; 32] = [0u8; 32];

#[program]
pub mod cutloupe_ledger {
    use super::*;

    pub fn open_reel(ctx: Context<OpenReel>, reel_id: [u8; 16], title_hash: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let reel = &mut ctx.accounts.reel;
        reel.authority = ctx.accounts.authority.key();
        reel.reel_id = reel_id;
        reel.title_hash = title_hash;
        reel.head = ZERO;
        reel.version = 0;
        reel.exports = 0;
        reel.created_at = now;
        reel.updated_at = now;
        reel.bump = ctx.bumps.reel;
        emit!(ReelOpened {
            reel: reel.key(),
            authority: reel.authority,
            reel_id,
            title_hash,
        });
        Ok(())
    }

    pub fn commit_cut(
        ctx: Context<CommitCut>,
        prev: [u8; 32],
        next: [u8; 32],
        ops: u32,
        actor: u8,
    ) -> Result<()> {
        require!(actor <= ACTOR_MIXED, LedgerError::InvalidActor);
        require!(next != ZERO, LedgerError::ZeroHash);
        require!(next != prev, LedgerError::NoChange);
        let reel = &mut ctx.accounts.reel;
        require!(prev == reel.head, LedgerError::StaleHead);

        reel.version = reel.version.checked_add(1).ok_or(LedgerError::Overflow)?;
        reel.head = next;
        reel.updated_at = Clock::get()?.unix_timestamp;

        emit!(CutCommitted {
            reel: reel.key(),
            version: reel.version,
            prev,
            next,
            ops,
            actor,
        });
        Ok(())
    }

    pub fn seal_export(
        ctx: Context<SealExport>,
        file_sha256: [u8; 32],
        timeline_hash: [u8; 32],
        flags: u8,
        duration_ms: u32,
    ) -> Result<()> {
        require!(flags & !FLAG_MASK == 0, LedgerError::InvalidFlags);
        require!(file_sha256 != ZERO, LedgerError::ZeroHash);
        let reel = &mut ctx.accounts.reel;
        // Version 0 has a zero head: there is nothing committed to seal yet.
        require!(reel.version > 0, LedgerError::NotHead);
        require!(timeline_hash == reel.head, LedgerError::NotHead);

        let now = Clock::get()?.unix_timestamp;
        reel.exports = reel.exports.checked_add(1).ok_or(LedgerError::Overflow)?;
        reel.updated_at = now;

        let seal = &mut ctx.accounts.seal;
        seal.reel = reel.key();
        seal.authority = reel.authority;
        seal.file_sha256 = file_sha256;
        seal.timeline_hash = timeline_hash;
        seal.version = reel.version;
        seal.flags = flags;
        seal.duration_ms = duration_ms;
        seal.sealed_at = now;
        seal.bump = ctx.bumps.seal;

        emit!(ExportSealed {
            reel: seal.reel,
            seal: seal.key(),
            file_sha256,
            timeline_hash,
            version: seal.version,
            flags,
            duration_ms,
        });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(reel_id: [u8; 16])]
pub struct OpenReel<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Reel::INIT_SPACE,
        seeds = [b"reel", authority.key().as_ref(), reel_id.as_ref()],
        bump
    )]
    pub reel: Account<'info, Reel>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitCut<'info> {
    #[account(
        mut,
        seeds = [b"reel", reel.authority.as_ref(), reel.reel_id.as_ref()],
        bump = reel.bump,
        has_one = authority @ LedgerError::Unauthorized
    )]
    pub reel: Account<'info, Reel>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(file_sha256: [u8; 32])]
pub struct SealExport<'info> {
    #[account(
        mut,
        seeds = [b"reel", reel.authority.as_ref(), reel.reel_id.as_ref()],
        bump = reel.bump,
        has_one = authority @ LedgerError::Unauthorized
    )]
    pub reel: Account<'info, Reel>,
    #[account(
        init,
        payer = authority,
        space = 8 + Seal::INIT_SPACE,
        seeds = [b"seal", file_sha256.as_ref()],
        bump
    )]
    pub seal: Account<'info, Seal>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Reel {
    pub authority: Pubkey,
    pub reel_id: [u8; 16],
    pub title_hash: [u8; 32],
    pub head: [u8; 32],
    pub version: u32,
    pub exports: u32,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Seal {
    pub reel: Pubkey,
    pub authority: Pubkey,
    pub file_sha256: [u8; 32],
    pub timeline_hash: [u8; 32],
    pub version: u32,
    pub flags: u8,
    pub duration_ms: u32,
    pub sealed_at: i64,
    pub bump: u8,
}

#[event]
pub struct ReelOpened {
    pub reel: Pubkey,
    pub authority: Pubkey,
    pub reel_id: [u8; 16],
    pub title_hash: [u8; 32],
}

#[event]
pub struct CutCommitted {
    pub reel: Pubkey,
    pub version: u32,
    pub prev: [u8; 32],
    pub next: [u8; 32],
    pub ops: u32,
    pub actor: u8,
}

#[event]
pub struct ExportSealed {
    pub reel: Pubkey,
    pub seal: Pubkey,
    pub file_sha256: [u8; 32],
    pub timeline_hash: [u8; 32],
    pub version: u32,
    pub flags: u8,
    pub duration_ms: u32,
}

#[error_code]
pub enum LedgerError {
    #[msg("prev does not match the reel's current head")]
    StaleHead,
    #[msg("timeline_hash is not the reel's committed head")]
    NotHead,
    #[msg("next must differ from prev")]
    NoChange,
    #[msg("hash must not be all zeros")]
    ZeroHash,
    #[msg("actor must be 0 (human), 1 (agent) or 2 (mixed)")]
    InvalidActor,
    #[msg("only bits 0-3 of flags are defined")]
    InvalidFlags,
    #[msg("signer is not the reel authority")]
    Unauthorized,
    #[msg("arithmetic overflow")]
    Overflow,
}

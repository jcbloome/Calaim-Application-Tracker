export const isCaspioWriteReadOnly = () => {
  const raw = String(process.env.CASPIO_READ_ONLY || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

export const caspioWriteBlockedResponse = () => ({
  success: false,
  code: 'caspio-write-disabled',
  error: 'Caspio write operations are disabled by server policy (CASPIO_READ_ONLY).',
});

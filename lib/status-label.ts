export function getStatusLabel(status?: string): string {
  switch (status?.toLowerCase()) {
    case 'running':
      return 'Debate Running';
    case 'voting':
      return 'Voting in Progress';
    case 'ended':
      return 'Debate Concluded';
    case 'waiting':
      return 'Waiting for Next Debate';
    default:
      return 'Loading...';
  }
}

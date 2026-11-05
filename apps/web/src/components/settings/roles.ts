import type { AccountRole } from '../../stores/accounts'

/** An account role as people read it. */
export function accountRoleLabel(role: string): string {
  return role === 'OWNER' ? 'Owner' : role === 'ADMIN' ? 'Admin' : 'Member'
}

/** The badge colour of an account role, the same in every table. */
export function accountRoleBadge(role: string): 'purple' | 'blue' | 'grey' {
  return role === 'OWNER' ? 'purple' : role === 'ADMIN' ? 'blue' : 'grey'
}

/** The roles someone may give: admins give roles below owner, owners give any. */
export function accountRoleOptions(myRole: AccountRole | undefined) {
  const all = [
    { label: 'Member', value: 'MEMBER' },
    { label: 'Admin', value: 'ADMIN' },
  ]
  return myRole === 'OWNER' ? [...all, { label: 'Owner', value: 'OWNER' }] : all
}

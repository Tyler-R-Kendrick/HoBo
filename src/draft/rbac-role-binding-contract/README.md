# RBAC Role Binding Contract

This draft package proves the HOBO-158 RBAC model as a pure contract slice.
It consumes the existing control-plane action taxonomy and PrincipalRef role
constants, then resolves direct and SCIM-backed role bindings into
`subject.roles`.

The package intentionally stops at the role/binding boundary. It does not issue
identities, seed genesis or break-glass users, or integrate the default role
matrix into the policy engine; those remain separate slices.

## Verification

```powershell
npm.cmd --prefix src\draft\rbac-role-binding-contract test
```

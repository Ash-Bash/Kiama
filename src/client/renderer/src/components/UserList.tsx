import React from 'react';
import '../styles/components/UserList.scss';

interface UserEntry {
  name: string;
  role?: string;
  avatar?: string;
  status?: 'online' | 'offline' | 'idle' | 'dnd';
}

interface UserListProps {
  // Either an array of plain usernames or richer entries with role
  users: Array<string | UserEntry>;
  // Optional resolver from role -> color
  getRoleColor?: (role?: string) => string | undefined;
}

// Minimal read-only list of online users used by legacy views.
const UserList: React.FC<UserListProps> = ({ users, getRoleColor }) => {
  return (
    <div className="user-list">
      <h3>Online - {users.length}</h3>
      {users.map(u => {
        const user = typeof u === 'string' ? { name: u } : u;
        const color = getRoleColor ? getRoleColor(user.role) : undefined;
        return (
          <div key={user.name} className="user-item" style={{ padding: '4px 0' }}>
            <span className="user-name" style={color ? { color } : undefined}>{user.name}</span>
          </div>
        );
      })}
    </div>
  );
};

export default UserList;
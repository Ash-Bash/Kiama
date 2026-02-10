import React from 'react';
import '../styles/components/UserList.scss';

interface UserListProps {
  users: string[];
}

const UserList: React.FC<UserListProps> = ({ users }) => {
  return (
    <div className="user-list">
      <h3>Online - {users.length}</h3>
      {users.map(user => (
        <div key={user} className="user-item" style={{ padding: '4px 0' }}>
          {user}
        </div>
      ))}
    </div>
  );
};

export default UserList;
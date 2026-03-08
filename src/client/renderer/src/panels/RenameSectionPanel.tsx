import React from 'react';
import ModalPanel from '../components/ModalPanel';
import Button from '../components/Button';
import TextField from '../components/TextField';

interface RenameSectionPanelProps {
  sectionName: string;
  onRename: (name: string) => Promise<void>;
  onCancel: () => void;
}

const RenameSectionPanel: React.FC<RenameSectionPanelProps> = ({ sectionName, onRename, onCancel }) => {
  const [val, setVal] = React.useState(sectionName);

  const submit = async () => {
    if (val.trim()) {
      await onRename(val.trim());
    }
  };

  return (
    <ModalPanel
      title="Rename Section"
      description="Enter a new name for this section."
      icon={<i className="fas fa-folder-open" />}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!val.trim()}
            onClick={submit}
          >
            Rename
          </Button>
        </>
      }
    >
      <div className="rename-modal">
        <TextField
          label="Section name"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={sectionName}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        />
      </div>
    </ModalPanel>
  );
};

export default RenameSectionPanel;

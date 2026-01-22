// Simple test script to debug the Kaiser API
async function testKaiserAPI() {
  try {
    console.log('🧪 Testing Kaiser API...');
    
    const response = await fetch('http://localhost:3000/api/kaiser-members');
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      console.error('❌ API request failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    
    console.log('✅ API Response Structure:');
    console.log('  - success:', data.success);
    console.log('  - count:', data.count);
    console.log('  - members length:', data.members?.length || 0);
    console.log('  - timestamp:', data.timestamp);
    
    if (data.members && data.members.length > 0) {
      console.log('\n🔍 First Member Sample:');
      const firstMember = data.members[0];
      console.log('  - ID:', firstMember.id);
      console.log('  - Name:', firstMember.memberName);
      console.log('  - Kaiser Status:', firstMember.Kaiser_Status);
      console.log('  - Staff Assigned:', firstMember.Staff_Assigned);
      console.log('  - Social Worker:', firstMember.Social_Worker_Assigned);
      
      console.log('\n📋 All Fields in First Member:');
      console.log(Object.keys(firstMember).sort());
      
      console.log('\n🔍 Staff Assignment Analysis:');
      const staffAssignments = {};
      data.members.forEach(member => {
        const staff = member.Staff_Assigned || 'Unassigned';
        staffAssignments[staff] = (staffAssignments[staff] || 0) + 1;
      });
      console.log(staffAssignments);
      
      console.log('\n🔍 Social Worker Analysis:');
      const socialWorkers = {};
      data.members.forEach(member => {
        const sw = member.Social_Worker_Assigned || 'Unassigned';
        socialWorkers[sw] = (socialWorkers[sw] || 0) + 1;
      });
      console.log(socialWorkers);
    } else {
      console.log('⚠️ No members found in response');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testKaiserAPI();
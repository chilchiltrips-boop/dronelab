#!/usr/bin/env python3
"""Render actual exported teaching traces; Matplotlib is a review-only dependency."""
from pathlib import Path
import csv,json,sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root=Path(sys.argv[1] if len(sys.argv)>1 else 'test-output/numerical')
def trace(name):
    rows=list(csv.DictReader((root/name).open()))
    return {key:[float(r[key]) for r in rows] for key in rows[0] if key!='stop'}
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'svg.fonttype':'none','axes.spines.top':False,'axes.spines.right':False,'axes.grid':True,'grid.alpha':.2,'figure.facecolor':'#f5fafb','axes.facecolor':'#ffffff'})
colors=['#078476','#ce673c','#3356a5']
def save(fig,name):
    fig.savefig(root/(name+'.svg'),bbox_inches='tight')
    fig.savefig(root/(name+'.png'),dpi=170,bbox_inches='tight');plt.close(fig)

v=trace('vertical-thrust.csv');fig,axes=plt.subplots(4,1,figsize=(10,10),sharex=True)
fig.suptitle('Constrained tripod: command → actual RPM → force → mount travel\nEducational estimates; 4 ms fixed step, 1.12 kg, 12.2 V, 0.12 s motor lag',fontsize=13)
axes[0].step(v['time_s'],v['throttle_us'],where='post',color=colors[0]);axes[0].set_ylabel('Throttle (µs)')
axes[1].plot(v['time_s'],v['requested_rpm'],'--',color='#97a8b0',label='Requested');axes[1].plot(v['time_s'],v['actual_rpm'],color=colors[0],label='Actual M1 (balanced motors)');axes[1].set_ylabel('RPM');axes[1].legend(loc='upper left')
axes[2].plot(v['time_s'],v['total_upward_thrust_N'],color=colors[0],label='Upward thrust');axes[2].plot(v['time_s'],v['weight_N'],'--',color=colors[1],label='Weight');axes[2].set_ylabel('Force (N)');axes[2].legend(loc='upper left')
axes[3].plot(v['time_s'],v['z_cm'],color=colors[0],label='Measured mount deflection');axes[3].axhline(12,ls='--',color=colors[1],label='Upper stop');axes[3].set_ylabel('Travel (cm)');axes[3].set_xlabel('Elapsed scenario time (s)');axes[3].legend(loc='upper left')
for ax in axes:ax.axvline(18,color='#ad3046',ls=':',label='STOP');ax.set_xlim(0,20)
axes[3].annotate('STOP: zero motor output; attached mast returns',xy=(18.6,0),xytext=(12,4),arrowprops={'arrowstyle':'->','color':'#ad3046'},fontsize=9)
fig.tight_layout(rect=(0,0,1,.95));save(fig,'vertical-thrust')

meta=json.loads((root/'metrics.json').read_text());fig,axes=plt.subplots(3,1,figsize=(10,9),sharex=True)
fig.suptitle('Rate PID comparisons under identical conditions\nSame 48 °/s pulse, CG roll bias 2 mm, seeded 0.07 °/s gyro noise and plant',fontsize=13)
for ax,group,label in zip(axes,[['Stable','Low P','High P'],['Stable','Low I','High I'],['Stable','Low D','High D']],['P response','I bias recovery','D damping']):
    for n,name in enumerate(group):
        item=next(r for r in meta['results'] if r['name']==name);r=trace(item['file']);ax.plot(r['time_s'],r['actual_deg_s'],color=colors[n],label=name)
        if n==0:ax.plot(r['time_s'],r['target_deg_s'],'--',color='#76858f',label='Target')
    ax.set_ylabel(label+'\nRate (°/s)');ax.legend(loc='upper right',ncol=2);ax.set_xlim(0,8)
axes[-1].set_xlabel('Simulated time (s)');fig.tight_layout(rect=(0,0,1,.94));save(fig,'pid-comparison')

fig,axes=plt.subplots(2,1,figsize=(10,6),sharex=True);fig.suptitle('Filtered D noise sensitivity — no disturbance or artificial motion\nSame seed/0.07 °/s gyro noise, P=0.9, I=15, CG zero; 6–8 s window',fontsize=12)
for n,item in enumerate(meta['dNoise']):
    r=trace(item['file']);indexes=[i for i,t in enumerate(r['time_s']) if t>=6];t=[r['time_s'][i] for i in indexes]
    axes[0].plot(t,[r['D'][i] for i in indexes],color=colors[n],label='D='+str(item['d']))
    mean=sum(r['m1_command_pct'][i] for i in indexes)/len(indexes)
    axes[1].plot(t,[r['m1_command_pct'][i]-mean for i in indexes],color=colors[n],label='D='+str(item['d']))
axes[0].set_ylabel('D contribution');axes[1].set_ylabel('M1 command variation\n(percentage points)');axes[1].set_xlabel('Simulated time (s)')
for ax in axes:ax.legend(loc='upper right',ncol=3);ax.set_xlim(6,8)
fig.tight_layout(rect=(0,0,1,.91));save(fig,'d-noise')
print('Rendered vertical thrust, seven-preset PID and D-noise SVG/PNG from CSV')
